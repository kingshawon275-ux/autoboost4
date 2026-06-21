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
    // Only skip explicitly-disabled panels. A panel showing "ERROR" (a
    // transient balance/sync hiccup) can still accept orders, so we DON'T skip
    // it here — otherwise services silently go missing.
    if (!m.panel.enabled) continue;
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
        // Clamp the quantity to the panel service's min/max so the panel never
        // rejects the order with "Quantity less than minimal" / "more than max"
        // (which was making orders go missing). We bump up to min / down to max
        // and just note it, so every selected service actually goes through.
        // (Custom comments can't be clamped — their count is fixed.)
        if (!customComments && c.min && qty < c.min) {
          warnings.push(`${c.panelName}: raised ${boostType} to min ${c.min} (was ${qty}).`);
          qty = c.min;
        }
        if (!customComments && c.max && qty > c.max) {
          warnings.push(`${c.panelName}: lowered ${boostType} to max ${c.max} (was ${qty}).`);
          qty = c.max;
        }
        const estCost = +(qty * (c.ratePer1000 / 1000)).toFixed(4);
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

  // Visibility: log exactly what was planned so any "missing service" is obvious
  // in pm2 logs (which boost on which panel, and any warnings that dropped one).
  console.log(
    `[plan] ${input.boosts.length} boost(s) x ${input.panelIds.length} panel(s) selected -> ${jobs.length} order(s):`,
    jobs.map((j) => `${j.alloc.panelName}/${j.boostType}`).join(", ") || "(none)",
  );
  if (plan.warnings.length) console.log(`[plan] warnings: ${plan.warnings.join(" | ")}`);

  if (!jobs.length) return { batchId, plan, orders: [] };

  // 1) Save ALL orders instantly as PENDING (one bulk insert). This never times
  // out no matter how many orders — submission happens in the background.
  const ids = jobs.map(() => randomBytes(12).toString("hex"));
  await prisma.order.createMany({
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
      // The instant submit below + its in-line retry loop handle these. Set a
      // small scheduler delay (8s) as a SAFETY NET: if the whole process were to
      // restart mid-submit, the scheduler still picks the order up — nothing is
      // ever lost. (The instant submit normally finishes well before this.)
      nextRetryAt: new Date(Date.now() + 8_000),
      panelId: j.alloc.panelId,
      serviceId: j.alloc.serviceId,
      userId,
    })),
  });

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
  const t0 = Date.now();
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

    // CLAIM the order atomically before sending it to the panel. updateMany only
    // flips it if it's still PENDING with no provider id, so if the background
    // scheduler (or another run) already grabbed it, claimed.count === 0 and we
    // skip — this prevents the SAME order being sent to the panel twice (the
    // duplicate-order bug). We mark it PROCESSING up-front; commitSuccess sets
    // the real providerOrderId, or we roll back to PENDING on a transient fail.
    const claimed = await prisma.order.updateMany({
      where: { id: order.id, status: "PENDING", providerOrderId: null },
      data: { status: "PROCESSING" },
    });
    if (claimed.count === 0) {
      console.log(`[submit] skip ${order.panel.name}/${order.boostType} (already claimed)`);
      return false; // someone else is sending it
    }

    const client = new SmmClient(order.panel.apiUrl, order.panel.apiKey);
    const callStart = Date.now();
    const res = await client.addOrder({
      service: order.serviceId,
      link: order.postUrl,
      quantity: order.quantity,
      comments: order.comments ?? undefined,
    });
    console.log(
      `[submit] ${order.panel.name} ${order.boostType} (svc ${order.serviceId}) -> ${
        res.ok ? `OK #${res.data?.order ?? "?"}` : res.error?.slice(0, 50)
      } in ${Date.now() - callStart}ms`,
    );

    if (res.ok && res.data?.order) {
      let saved = await commitSuccess(order, String(res.data.order));
      if (!saved) {
        console.log(
          `[submit] ${order.panel.name} ${order.boostType} -> panel OK #${res.data.order} but DB save failed; retrying save`,
        );
        // The panel accepted it (don't resend = avoid duplicate). Keep retrying
        // ONLY the DB write until the provider id is recorded.
        for (let i = 0; i < 20 && !saved; i++) {
          await new Promise((r) => setTimeout(r, 1000 + i * 500));
          saved = await commitSuccess(order, String(res.data.order));
        }
      }
      return true;
    } else if (isActiveOrderError(res.error)) {
      // The panel still has an active order on this link. Retry RIGHT HERE a few
      // times (short waits) so the service lands now, instead of relying on a
      // later scheduler pass. Keep it PROCESSING (claimed) so nothing else grabs
      // it; only roll back to PENDING if we exhaust the in-line retries.
      for (let attempt = 0; attempt < 6; attempt++) {
        await new Promise((r) => setTimeout(r, 2500));
        const retryRes = await client.addOrder({
          service: order.serviceId,
          link: order.postUrl,
          quantity: order.quantity,
          comments: order.comments ?? undefined,
        });
        if (retryRes.ok && retryRes.data?.order) {
          console.log(`[submit] ${order.panel.name} ${order.boostType} -> OK (retry ${attempt + 1})`);
          await commitSuccess(order, String(retryRes.data.order));
          return true;
        }
        if (isPermanentError(retryRes.error)) {
          await markFailed(order.id, retryRes.error ?? "Provider rejected order");
          return false;
        }
        if (!isActiveOrderError(retryRes.error)) break; // different error → fall through
      }
      // Still blocked → hand to the background queue (PENDING, soon).
      await prisma.order
        .update({
          where: { id: order.id },
          data: { status: "PENDING", nextRetryAt: new Date(Date.now() + 3_000), errorMessage: "Resending…" },
        })
        .catch(() => {});
      console.log(`[submit] ${order.panel.name} ${order.boostType} -> still active, queued`);
      return false;
    } else if (isPermanentError(res.error)) {
      // Hard rejection (balance / invalid link…) → fail now.
      await markFailed(order.id, res.error ?? "Provider rejected order");
      return false;
    } else {
      // Network/transient → roll back to PENDING for a quick retry.
      await prisma.order
        .update({
          where: { id: order.id },
          data: {
            status: "PENDING",
            nextRetryAt: new Date(Date.now() + 3_000),
            errorMessage: "Resending…",
          },
        })
        .catch(() => {});
      console.log(`[submit] ${order.panel.name} ${order.boostType} -> ${res.error?.slice(0, 30)}, queued`);
      return false;
    }
  };

  // Fire EVERY order at its panel in PARALLEL — fully instant, all in the same
  // second (different services like/love/care/share on one link go together).
  // Most panels accept many DIFFERENT services on one link at once. In the rare
  // case a panel returns "active order with this link", submitOne retries that
  // one order in-line (a few short attempts) until it's accepted — so it still
  // lands quickly and nothing is missing, without slowing the others down.
  await mapLimit(orders, 50, async (order) => {
    const ok = await submitOne(order);
    if (ok) anyOk = true;
  });

  if (anyOk) emitUpdate("orders", "dashboard", "panels");

  // GUARANTEE no order is left behind. After the first pass, re-check THESE ids
  // for any that haven't reached the panel yet — this includes orders still
  // PENDING (rolled back) AND orders stuck PROCESSING with NO providerOrderId
  // (claimed, but the success-write hit a transient DB conflict). We reset those
  // back to PENDING and resend, up to several rounds, so nothing is left behind.
  for (let round = 0; round < 10; round++) {
    const leftoverRaw = await prisma.order.findMany({
      where: {
        id: { in: ids },
        providerOrderId: null,
        status: { in: ["PENDING", "PROCESSING"] },
      },
      include: { panel: true },
    });
    if (leftoverRaw.length === 0) break;

    // Reset any stuck PROCESSING (no provider id) back to PENDING so the claim
    // guard in submitOne works for them again.
    const stuckIds = leftoverRaw.filter((o) => o.status === "PROCESSING").map((o) => o.id);
    if (stuckIds.length) {
      await prisma.order
        .updateMany({
          where: { id: { in: stuckIds }, status: "PROCESSING", providerOrderId: null },
          data: { status: "PENDING" },
        })
        .catch(() => {});
    }

    console.log(`[submit] round ${round + 2}: resending ${leftoverRaw.length} leftover order(s)`);
    await new Promise((r) => setTimeout(r, 3000));
    // Re-fetch fresh so statuses are current after the reset above.
    const toSend = await prisma.order.findMany({
      where: { id: { in: leftoverRaw.map((o) => o.id) }, status: "PENDING", providerOrderId: null },
      include: { panel: true },
    });
    await mapLimit(toSend, 50, async (order) => {
      const ok = await submitOne(order);
      if (ok) anyOk = true;
    });
    if (anyOk) emitUpdate("orders", "dashboard", "panels");
  }

  const stillPending = await prisma.order.count({
    where: { id: { in: ids }, providerOrderId: null, status: { in: ["PENDING", "PROCESSING"] } },
  });
  console.log(
    `[submit] ${orders.length} order(s) done in ${Date.now() - t0}ms` +
      (stillPending ? ` — ${stillPending} still queued for the scheduler` : " — all sent"),
  );
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
    // Fetch orders that still need submitting. This includes PENDING orders AND
    // "ghost" PROCESSING orders that were claimed but never got a providerOrderId
    // (e.g. the process restarted mid-submit) — otherwise such an order would be
    // stuck forever and look like "it never went to the panel". We recover any
    // PROCESSING+no-provider order older than 30s back into the retry flow.
    // Recover orders stuck PROCESSING with no providerOrderId after 12s (claimed
    // but the success-write failed). Kept short so nothing lingers unsent.
    const ghostCutoff = new Date(now - 12_000);
    const [pendingRaw, ghosts] = await Promise.all([
      prisma.order.findMany({
        where: { status: "PENDING" },
        include: { panel: true },
        take: limit,
        orderBy: { createdAt: "asc" },
      }),
      prisma.order.findMany({
        where: { status: "PROCESSING", updatedAt: { lt: ghostCutoff } },
        include: { panel: true },
        take: limit,
        orderBy: { createdAt: "asc" },
      }),
    ]);
    // Reset ghosts to PENDING so the claim-guard works for them again.
    const ghostIds = ghosts.filter((o) => !o.providerOrderId).map((o) => o.id);
    if (ghostIds.length) {
      await prisma.order
        .updateMany({
          where: { id: { in: ghostIds }, status: "PROCESSING", providerOrderId: null },
          data: { status: "PENDING", nextRetryAt: new Date() },
        })
        .catch(() => {});
    }
    const ghostSet = new Set(ghostIds);
    const due = [
      ...pendingRaw,
      ...ghosts.filter((o) => ghostSet.has(o.id)).map((o) => ({ ...o, status: "PENDING" as const })),
    ];
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

      // Atomically claim before sending — prevents this order being submitted
      // twice (e.g. by a concurrent instant-submit). Skip if already claimed.
      const claimed = await prisma.order.updateMany({
        where: { id: order.id, status: "PENDING", providerOrderId: null },
        data: { status: "PROCESSING" },
      });
      if (claimed.count === 0) return;

      const client = new SmmClient(order.panel.apiUrl, order.panel.apiKey);
      const res = await client.addOrder({
        service: order.serviceId,
        link: order.postUrl,
        quantity: order.quantity,
        comments: order.comments ?? undefined,
      });

      if (res.ok && res.data?.order) {
        let saved = await commitSuccess(order, String(res.data.order));
        for (let i = 0; i < 20 && !saved; i++) {
          await new Promise((r) => setTimeout(r, 1000 + i * 500));
          saved = await commitSuccess(order, String(res.data.order));
        }
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
              // roll back to PENDING so it's retried; don't count as an attempt.
              status: "PENDING",
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
              status: "PENDING", // roll back so the claim guard works next time
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
function isActiveOrderError(error?: unknown): boolean {
  const e = String(error ?? "").toLowerCase();
  if (!e) return false;
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
// immediately. Covers balance, invalid link/service, and quantity/limit
// problems (e.g. "Quantity less than minimal 50"). NOTE: "active order" is NOT
// here — that's temporary (see isActiveOrderError).
function isPermanentError(error?: unknown): boolean {
  const e = String(error ?? "").toLowerCase();
  if (!e) return false;
  const permanent = [
    // balance / funds
    "balance", "fund", "insufficient", "not enough", "top up", "top-up", "topup",
    // link / service problems
    "invalid", "incorrect", "not found", "wrong link", "wrong url", "no service",
    // quantity / limit / format (covers "less than minimal", "min", "max", etc.)
    "minimal", "minimum", "maximum", "less than", "more than", "quantity",
    "min ", "max ", "out of range", "not divisible", "step",
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
async function commitSuccess(order: SubmittableOrder, providerOrder: string): Promise<boolean> {
  // The ONE essential write — record the provider order id. Retry hard (20x).
  // CRUCIALLY this never throws: if it still can't write, we return false and
  // the caller leaves the order to be retried, instead of it bubbling up and
  // leaving the order stuck PROCESSING with no provider id.
  let saved = false;
  try {
    await withRetry(
      () =>
        prisma.order.update({
          where: { id: order.id },
          data: { status: "PROCESSING", providerOrderId: providerOrder, nextRetryAt: null, errorMessage: null },
        }),
      20,
    );
    saved = true;
  } catch {
    saved = false;
  }

  // Bookkeeping (log + transaction) is fire-and-forget background work — it must
  // never block or fail the order. Running it detached also keeps it from
  // contending with the essential write above.
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

  // Balance is NOT decremented here — many orders on one panel caused deadlocks.
  // The periodic balance sync pulls the accurate value from the provider.
  return saved;
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
export async function refreshOrderStatuses(limit = 500) {
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

  // Check provider statuses with bounded concurrency (fast even for hundreds of
  // orders without hammering any one panel), then persist changes.
  const results = await mapLimit(orders, 20, async (order) => {
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
