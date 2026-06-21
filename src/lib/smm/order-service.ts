import { randomUUID, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { SmmClient } from "@/lib/smm/client";
import { resolveQuantity, type PanelCandidate } from "@/lib/smm/distribution";
import { withRetry } from "@/lib/db-retry";
import { mapLimit } from "@/lib/concurrency";
import { emitUpdate } from "@/lib/realtime";
import type { AutoBoostInput } from "@/lib/validators";
import type { BoostType } from "@prisma/client";

export interface BoostAllocation {
  panelId: string;
  panelName: string;
  serviceId: string;
  quantity: number;
  estCost: number;
  rate: number;
  comments?: string; // custom comments (one per line) for COMMENT boosts
}

export interface BoostPlanItem {
  boostType: BoostType;
  quantity: number;
  allocations: BoostAllocation[];
  totalCost: number;
  warnings: string[];
}

export interface BoostPlan {
  postUrl: string;
  platform: string;
  items: BoostPlanItem[];
  totalCost: number;
  warnings: string[];
}

/**
 * Pick `count` comments from a pool at random. If the pool is smaller than the
 * requested count, it wraps around (reusing comments) so the full quantity is
 * always produced. The pool is shuffled each pass so the order varies.
 */
function pickRandomComments(pool: string[], count: number): string[] {
  const out: string[] = [];
  const shuffle = () => {
    const a = [...pool];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  while (out.length < count) {
    const batch = shuffle();
    for (const c of batch) {
      out.push(c);
      if (out.length >= count) break;
    }
  }
  return out;
}

/**
 * Build candidate panels for a given boost type, using ServiceMappings to
 * resolve which provider service each panel should use. Falls back to a
 * best-guess category match when no explicit mapping exists.
 */
async function candidatesFor(
  boostType: BoostType,
  platform: string,
  panelIds: string[],
): Promise<PanelCandidate[]> {
  const mappings = await prisma.serviceMapping.findMany({
    where: { boostType, platform, panelId: { in: panelIds }, enabled: true },
    include: { panel: true, service: true },
  });

  const candidates: PanelCandidate[] = [];
  for (const m of mappings) {
    if (!m.panel.enabled || m.panel.status === "DISABLED") continue;
    candidates.push({
      panelId: m.panelId,
      panelName: m.panel.name,
      serviceId: m.service.serviceId,
      ratePer1000: m.service.rate,
      balance: m.panel.balance,
      successRate: m.panel.successRate,
      responseMs: m.panel.responseMs,
      priority: m.panel.priority,
      min: m.service.min,
      max: m.service.max,
    });
  }
  return candidates;
}

/** Compute a full plan without creating any orders (used for dry-run preview). */
export async function planAutoBoost(input: AutoBoostInput): Promise<BoostPlan> {
  const items: BoostPlanItem[] = [];
  const planWarnings: string[] = [];

  for (const boost of input.boosts) {
    const boostType = boost.boostType;

    // ----- Resolve the comments to send (if any) and the quantity. -----
    // Priority for COMMENT boosts:
    //   1) typed custom comments        → quantity = number of lines
    //   2) a selected comment library   → pick `quantity` random lines
    //   3) nothing                      → normal quantity (panel's own comments)
    const typedLines =
      boostType === "COMMENT" && boost.comments
        ? boost.comments.split("\n").map((l) => l.trim()).filter(Boolean)
        : [];

    let customComments: string | undefined;
    let baseQuantity: number;

    if (typedLines.length) {
      customComments = typedLines.join("\n");
      baseQuantity = typedLines.length;
    } else {
      baseQuantity = resolveQuantity({
        mode: boost.quantityMode,
        fixed: boost.fixedQuantity,
        min: boost.minQuantity,
        max: boost.maxQuantity,
      });

      if (boostType === "COMMENT" && boost.commentLibraryId) {
        const lib = await prisma.commentLibrary.findUnique({
          where: { id: boost.commentLibraryId },
        });
        const pool = lib?.comments?.filter((c) => c.trim()) ?? [];
        if (pool.length) {
          customComments = pickRandomComments(pool, baseQuantity).join("\n");
        } else {
          planWarnings.push(`Comment library "${lib?.name ?? boost.commentLibraryId}" is empty.`);
        }
      }
    }

    const candidates = await candidatesFor(boostType, input.platform, input.panelIds);
    if (!candidates.length) {
      planWarnings.push(
        `No service mapping found for ${boostType} on ${input.platform} for the selected panels.`,
      );
      items.push({ boostType, quantity: baseQuantity, allocations: [], totalCost: 0, warnings: ["No mapped service"] });
      continue;
    }

    // Each selected panel receives the FULL quantity (no splitting). In manual
    // mode, only panels that explicitly list this boost are ordered.
    const warnings: string[] = [];
    const allocations = candidates
      .map((c) => {
        const manualForPanel = input.manualQuantities?.[c.panelId];
        let qty: number;
        if (customComments) {
          // Custom comments: quantity is fixed by the comment list for every panel.
          // In manual mode, a 0/absent entry still means "skip this panel".
          if (input.manualMode) {
            const manual = manualForPanel?.[boostType];
            if (manual == null || manual <= 0) return null;
          }
          qty = baseQuantity;
        } else if (input.manualMode) {
          const manual = manualForPanel?.[boostType];
          if (manual == null || manual <= 0) return null; // not selected for this panel
          qty = manual;
        } else {
          qty = baseQuantity;
        }
        const estCost = +(qty * (c.ratePer1000 / 1000)).toFixed(4);
        if (qty < c.min) warnings.push(`${c.panelName}: ${qty} is below min ${c.min} for ${boostType}`);
        if (qty > c.max) warnings.push(`${c.panelName}: ${qty} exceeds max ${c.max} for ${boostType}`);
        return {
          panelId: c.panelId,
          panelName: c.panelName,
          serviceId: c.serviceId,
          quantity: qty,
          estCost,
          rate: c.ratePer1000,
          comments: customComments,
        };
      })
      .filter((a): a is NonNullable<typeof a> => a !== null);

    const totalCost = +allocations.reduce((s, a) => s + a.estCost, 0).toFixed(4);
    items.push({ boostType, quantity: baseQuantity, allocations, totalCost, warnings });
  }

  const totalCost = +items.reduce((s, i) => s + i.totalCost, 0).toFixed(4);
  return { postUrl: input.postUrl, platform: input.platform, items, totalCost, warnings: planWarnings };
}

/**
 * Execute an Auto Boost: build the plan, create Order rows, submit each
 * allocation to the provider, and record results. Returns the created orders.
 */
export async function executeAutoBoost(input: AutoBoostInput, userId: string) {
  const plan = await planAutoBoost(input);
  const batchId = randomUUID();

  // Flatten every allocation into a job.
  type Job = { boostType: BoostType; alloc: BoostPlanItem["allocations"][number] };
  const jobs: Job[] = [];
  for (const item of plan.items) {
    for (const alloc of item.allocations) jobs.push({ boostType: item.boostType, alloc });
  }
  if (!jobs.length) return { batchId, plan, orders: [] };

  // 1) Save ALL orders instantly as PENDING (one bulk insert). withRetry guards
  // against a transient write-conflict when many users submit at the same time,
  // so the save is always fast and reliable for everyone.
  const ids = jobs.map(() => randomBytes(12).toString("hex"));
  await withRetry(() =>
    prisma.order.createMany({
      data: jobs.map((j, i) => ({
        id: ids[i],
        batchId,
        postUrl: plan.postUrl,
        platform: plan.platform,
        boostType: j.boostType,
        quantity: j.alloc.quantity,
        cost: j.alloc.estCost,
        remains: j.alloc.quantity,
        comments: j.alloc.comments ?? null,
        status: "PENDING" as const,
        providerOrderId: null,
        submitAttempts: 0,
        nextRetryAt: new Date(), // ready to submit now
        panelId: j.alloc.panelId,
        serviceId: j.alloc.serviceId,
        userId,
      })),
    }),
  );

  // Orders are saved → tell clients to refresh instantly.
  emitUpdate("orders", "dashboard");

  // 2) Submit THESE orders to the provider immediately — fire-and-forget so the
  // request returns instantly, but the submission starts right now (it does NOT
  // wait for the shared background queue, so there's no delay).
  void submitOrdersByIds(ids).catch(() => {});

  const orders = await prisma.order.findMany({
    where: { id: { in: ids } },
    include: { panel: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return { batchId, plan, orders };
}

/**
 * Submit a specific set of just-created orders to their providers immediately,
 * with high concurrency. Does NOT take the shared `submitting` lock, so a
 * running background retry never delays a fresh order. Failures fall back to the
 * background retry queue (via nextRetryAt).
 */
async function submitOrdersByIds(ids: string[]) {
  if (!ids.length) return;
  const orders = await prisma.order.findMany({
    where: { id: { in: ids } },
    include: { panel: true },
  });

  let anyOk = false;

  // Submit ONE order to its provider. Returns true on success.
  const submitOne = async (order: (typeof orders)[number]): Promise<boolean> => {
    if (order.providerOrderId || order.status !== "PENDING") return false;
    if (!order.panel || !order.serviceId) {
      await markFailed(order.id, "Missing panel/service");
      return false;
    }
    const client = new SmmClient(order.panel.apiUrl, order.panel.apiKey);
    const res = await client.addOrder({
      service: order.serviceId,
      link: order.postUrl,
      quantity: order.quantity,
      comments: order.comments ?? undefined,
    });

    if (res.ok && res.data?.order) {
      await commitSuccess(order, String(res.data.order));
      return true;
    } else if (isPermanentError(res.error)) {
      // Hard rejection (balance / invalid link…) → fail now.
      await markFailed(order.id, res.error ?? "Provider rejected order");
      return false;
    } else if (isActiveOrderError(res.error)) {
      // Same link already has an active order on this panel. Retry RIGHT HERE a
      // few times (short gaps) so it lands in seconds, not after a long wait.
      for (let attempt = 0; attempt < 5; attempt++) {
        await new Promise((r) => setTimeout(r, 2000));
        const retry = await client.addOrder({
          service: order.serviceId,
          link: order.postUrl,
          quantity: order.quantity,
          comments: order.comments ?? undefined,
        });
        if (retry.ok && retry.data?.order) {
          await commitSuccess(order, String(retry.data.order));
          return true;
        }
        if (isPermanentError(retry.error)) {
          await markFailed(order.id, retry.error ?? "Provider rejected order");
          return false;
        }
        if (!isActiveOrderError(retry.error)) break;
      }
      // Still blocked → short retry via the background queue (not a long wait).
      await prisma.order
        .update({
          where: { id: order.id },
          data: { nextRetryAt: new Date(Date.now() + 5_000), errorMessage: "Resending…" },
        })
        .catch(() => {});
      return false;
    } else {
      // Network/transient → quick background retry.
      await prisma.order
        .update({
          where: { id: order.id },
          data: { nextRetryAt: new Date(Date.now() + 3_000), errorMessage: "Resending…" },
        })
        .catch(() => {});
      return false;
    }
  };

  // Submit everything in PARALLEL for maximum speed — most panels accept many
  // services on the same link at once (no collision). If a panel ever returns
  // "You have active order with this link", that order is simply retried by the
  // background queue (isActiveOrderError) instead of failing — so it's never
  // lost and every other order still goes out at full speed.
  await mapLimit(orders, 25, async (order) => {
    const ok = await submitOne(order);
    if (ok) anyOk = true;
  });

  if (anyOk) emitUpdate("orders", "dashboard", "panels");
}

// Prevent overlapping background runs in the same process.
let submitting = false;
// Non-balance errors retry many times before giving up, so temporary issues
// (network/provider hiccups) almost never turn into a real FAILED.
const MAX_ATTEMPTS = 12;

/**
 * Submit all PENDING orders that are due (nextRetryAt <= now) to their provider.
 * Runs with limited concurrency. On transient failure, schedules a retry with
 * exponential backoff so orders are NEVER permanently lost to a network blip —
 * only a real provider rejection (after MAX_ATTEMPTS) becomes FAILED.
 */
export async function submitPendingOrders(limit = 200) {
  if (submitting) return { processed: 0, skipped: true };
  submitting = true;
  try {
    const now = Date.now();
    // Fetch PENDING orders; filter "due for retry" in JS so the query doesn't
    // depend on the nextRetryAt column existing (robust across schema versions).
    const due = await prisma.order.findMany({
      where: { status: "PENDING" },
      include: { panel: true },
      take: limit,
      orderBy: { createdAt: "asc" },
    });
    const pending = due.filter((o) => {
      if (o.providerOrderId) return false; // already submitted
      const next = o.nextRetryAt ? new Date(o.nextRetryAt).getTime() : 0;
      return next <= now; // due now (or no retry time set)
    });
    if (pending.length === 0) return { processed: 0 };

    let ok = 0;
    let retry = 0;
    let failed = 0;

    await mapLimit(pending, 8, async (order) => {
      if (!order.panel || !order.serviceId) {
        await markFailed(order.id, "Missing panel/service");
        failed++;
        return;
      }
      const client = new SmmClient(order.panel.apiUrl, order.panel.apiKey);
      const res = await client.addOrder({
        service: order.serviceId,
        link: order.postUrl,
        quantity: order.quantity,
        comments: order.comments ?? undefined,
      });

      if (res.ok && res.data?.order) {
        await commitSuccess(order, String(res.data.order));
        ok++;
        return;
      }

      // A permanent provider rejection (balance / invalid link…) fails now.
      // "active order with this link" is TEMPORARY → keep retrying (don't count
      // it against MAX_ATTEMPTS) until the earlier order on this link finishes.
      // Only a genuine network/timeout error is retried with backoff.
      const attempts = order.submitAttempts + 1;
      if (isPermanentError(res.error)) {
        await markFailed(order.id, res.error ?? "Provider rejected order");
        failed++;
      } else if (isActiveOrderError(res.error)) {
        await prisma.order
          .update({
            where: { id: order.id },
            data: {
              // don't increment attempts — this isn't a failure, just a wait.
              nextRetryAt: new Date(Date.now() + 60_000),
              errorMessage: "Waiting for the previous order on this link…",
            },
          })
          .catch(() => {});
        retry++;
      } else if (attempts < MAX_ATTEMPTS) {
        const backoffMs = Math.min(120_000, 3_000 * 2 ** order.submitAttempts);
        await prisma.order
          .update({
            where: { id: order.id },
            data: {
              submitAttempts: attempts,
              nextRetryAt: new Date(Date.now() + backoffMs),
              errorMessage: "Network issue, retrying…",
            },
          })
          .catch(() => {});
        retry++;
      } else {
        await markFailed(order.id, res.error ?? "Could not submit after several attempts");
        failed++;
      }
    });

    if (ok > 0 || failed > 0) emitUpdate("orders", "dashboard", "panels");
    return { processed: pending.length, ok, retry, failed };
  } finally {
    submitting = false;
  }
}

// "You have active order with this link" — the panel won't accept a 2nd order
// for the same link while one is in progress. This is TEMPORARY: once the first
// order finishes, the next is accepted. So we RETRY these (with a longer wait),
// not fail them.
function isActiveOrderError(error?: string | null): boolean {
  if (!error) return false;
  const e = error.toLowerCase();
  return (
    e.includes("active order") ||
    e.includes("already") ||
    e.includes("duplicate") ||
    e.includes("existing order") ||
    e.includes("in progress for this") ||
    e.includes("pending order")
  );
}

// Detect a PERMANENT provider rejection (retrying won't help) → fail
// immediately. Covers balance, invalid link/service, limits. NOTE: "active
// order" is NOT here — that's temporary (see isActiveOrderError).
function isPermanentError(error?: string | null): boolean {
  if (!error) return false;
  const e = error.toLowerCase();
  const permanent = [
    // balance / funds
    "balance", "fund", "insufficient", "not enough", "top up", "top-up", "topup",
    // link / service problems
    "invalid", "incorrect", "not found", "wrong link", "wrong url", "no service",
    // limits / format
    "min ", "max ", "minimum", "maximum",
    // generic hard rejections
    "not allowed", "disabled", "unavailable", "closed", "blocked",
  ];
  return permanent.some((w) => e.includes(w));
}

async function markFailed(orderId: string, message: string) {
  await withRetry(() =>
    prisma.$transaction([
      prisma.order.update({
        where: { id: orderId },
        data: { status: "FAILED", errorMessage: message },
      }),
      prisma.orderLog.create({ data: { orderId, status: "FAILED", message } }),
    ]),
  ).catch(() => {});
}

type SubmittableOrder = {
  id: string;
  cost: number;
  boostType: BoostType;
  quantity: number;
  userId: string;
  panelId: string;
  panel: { currency: string } | null;
};

/**
 * Record a successful provider submission. CRITICAL: once the provider accepts
 * an order, it MUST NOT end up Failed because of a DB hiccup. So we do the one
 * write that matters (mark PROCESSING + save providerOrderId) FIRST, on its own,
 * with heavy retry. The bookkeeping (log, transaction, balance decrement) is
 * done separately and best-effort — if it loses a write-conflict race against
 * the 3 other orders hitting the same panel, the order still stays PROCESSING
 * and the balance is corrected by the next balance sync.
 */
async function commitSuccess(order: SubmittableOrder, providerOrder: string) {
  // The essential write — record the provider id. updateMany (not update) is a
  // single lightweight write that won't deadlock against the bulk insert or
  // other orders hitting the same panel, so the order is never left stuck.
  await withRetry(
    () =>
      prisma.order.updateMany({
        where: { id: order.id },
        data: { status: "PROCESSING", providerOrderId: providerOrder, nextRetryAt: null, errorMessage: null },
      }),
    15,
  ).catch(() => {});

  // Bookkeeping (log + transaction) runs detached — best-effort, never blocks or
  // fails the order.
  void (async () => {
    await withRetry(() =>
      prisma.orderLog.create({
        data: { orderId: order.id, status: "PROCESSING", message: `Submitted (provider #${providerOrder})` },
      }),
    ).catch(() => {});
    await withRetry(() =>
      prisma.transaction.create({
        data: {
          type: "ORDER",
          amount: order.cost,
          currency: order.panel?.currency ?? "USD",
          userId: order.userId,
          orderId: order.id,
          panelId: order.panelId,
          note: `${order.boostType} x${order.quantity}`,
        },
      }),
    ).catch(() => {});
  })();

  // Balance is NOT decremented here — many orders on one panel caused deadlocks
  // that left orders stuck. The periodic balance sync pulls the accurate value.
}


/**
 * Mark long-stuck ghost orders (PENDING, no providerOrderId — never reached the
 * provider) as FAILED so they don't sit as PENDING forever. They were never
 * charged. Only touches orders older than `olderThanMs`.
 */
export async function failStuckOrders(olderThanMs = 10 * 60 * 1000) {
  const cutoff = new Date(Date.now() - olderThanMs);
  // Note: Prisma+Mongo `providerOrderId: null` filters miss documents where the
  // field is absent, so fetch PENDING orders and filter in JS by a usable id.
  const pending = await prisma.order.findMany({
    where: { status: "PENDING", createdAt: { lt: cutoff } },
    select: { id: true, providerOrderId: true },
  });
  const ghostIds = pending.filter((o) => !o.providerOrderId).map((o) => o.id);
  if (ghostIds.length === 0) return { failed: 0 };

  const res = await prisma.order.updateMany({
    where: { id: { in: ghostIds } },
    data: { status: "FAILED", errorMessage: "Order was not submitted to the provider." },
  });
  return { failed: res.count };
}

/** Poll the provider for status of in-flight orders and update our records. */
export async function refreshOrderStatuses(limit = 120) {
  // First, push any PENDING orders to the provider (and retry due ones). This
  // is isolated so a slow/failing submission can NEVER block status syncing —
  // that bug left many orders stuck "Processing" on the site while the panel
  // had long finished them.
  await submitPendingOrders().catch(() => {});

  const orders = await prisma.order.findMany({
    where: {
      status: { in: ["PENDING", "PROCESSING", "PARTIAL"] },
      providerOrderId: { not: null },
    },
    include: { panel: true },
    take: limit,
    orderBy: { updatedAt: "asc" },
  });

  const { mapProviderStatus } = await import("@/lib/smm/client");
  let updated = 0;

  // Check provider statuses with MODEST concurrency. Keeping this low matters on
  // a small VPS: hammering 20+ status calls every 20s saturated the network and
  // made interactive calls (balance/test) jump from ~300ms to several seconds.
  const results = await mapLimit(orders, 6, async (order) => {
    if (!order.panel || !order.providerOrderId) return null;
    const client = new SmmClient(order.panel.apiUrl, order.panel.apiKey);
    const res = await client.status(order.providerOrderId);
    if (!res.ok || !res.data) return null;

    const status = mapProviderStatus(res.data.status);
    const remains = res.data.remains != null ? parseInt(res.data.remains) : order.remains;
    const startCount = res.data.start_count != null ? parseInt(res.data.start_count) : order.startCount;
    if (status === order.status && remains === order.remains) return null;

    return { order, status, remains, startCount, providerStatus: res.data.status };
  });

  await Promise.all(
    results.map((r) => {
      if (!r) return Promise.resolve();
      const { order, status, remains, startCount, providerStatus } = r;
      updated++;
      // When an order is progressing/done, clear any stale error message so the
      // UI doesn't show old "Retrying…" text under a Completed order.
      const clearError = status !== "FAILED";
      return withRetry(() =>
        prisma.$transaction([
          prisma.order.update({
            where: { id: order.id },
            data: {
              status,
              remains: isNaN(remains) ? order.remains : remains,
              startCount: isNaN(startCount) ? order.startCount : startCount,
              ...(clearError ? { errorMessage: null } : {}),
            },
          }),
          prisma.orderLog.create({ data: { orderId: order.id, status, message: `Status: ${providerStatus}` } }),
        ]),
      ).catch(() => {});
    }),
  );

  if (updated > 0) emitUpdate("orders", "dashboard");
  return { checked: orders.length, updated };
}
