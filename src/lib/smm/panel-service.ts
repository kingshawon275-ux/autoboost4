import { prisma } from "@/lib/prisma";
import { SmmClient, type SmmService } from "@/lib/smm/client";
import { withRetry } from "@/lib/db-retry";
import { emitUpdate } from "@/lib/realtime";

async function logApi(opts: {
  panelId?: string;
  action: string;
  statusCode?: number;
  durationMs?: number;
  ok: boolean;
  response?: unknown;
}) {
  try {
    await prisma.apiLog.create({
      data: {
        panelId: opts.panelId,
        action: opts.action,
        statusCode: opts.statusCode,
        durationMs: opts.durationMs,
        ok: opts.ok,
        response: opts.response ? (opts.response as object) : undefined,
      },
    });
  } catch {
    /* logging best-effort */
  }
}

/** Test connectivity to a panel and update its status/responseMs. */
export async function testPanel(panelId: string) {
  const panel = await prisma.panel.findUnique({ where: { id: panelId } });
  if (!panel) throw new Error("Panel not found");

  const client = new SmmClient(panel.apiUrl, panel.apiKey);
  const res = await client.ping();

  await prisma.panel.update({
    where: { id: panelId },
    data: {
      status: res.ok ? "ONLINE" : "ERROR",
      responseMs: res.durationMs,
      balance: res.ok && res.data ? parseFloat(res.data.balance) || panel.balance : panel.balance,
      currency: res.ok && res.data?.currency ? res.data.currency : panel.currency,
      lastSyncedAt: new Date(),
    },
  });

  await logApi({
    panelId,
    action: "balance",
    statusCode: res.status,
    durationMs: res.durationMs,
    ok: res.ok,
    response: res.error ?? res.data,
  });

  emitUpdate("panels", "low-balance", "dashboard");
  return res;
}

/** Sync only the balance. */
export async function syncBalance(panelId: string) {
  const panel = await prisma.panel.findUnique({ where: { id: panelId } });
  if (!panel) throw new Error("Panel not found");

  const client = new SmmClient(panel.apiUrl, panel.apiKey);
  const res = await client.balance();

  if (res.ok && res.data) {
    const balance = parseFloat(res.data.balance) || 0;
    // Avoid a $transaction here: the manual sync and the background scheduler
    // can update the same panel concurrently, which makes MongoDB throw a write
    // conflict on the transaction. These two writes are independent, so run them
    // separately with a small retry on transient conflicts.
    await withRetry(() =>
      prisma.panel.update({
        where: { id: panelId },
        data: {
          balance,
          currency: res.data!.currency || panel.currency,
          status: "ONLINE",
          responseMs: res.durationMs,
          lastSyncedAt: new Date(),
        },
      }),
    );
    await prisma.balanceSnapshot.create({ data: { panelId, balance } }).catch(() => {});
  } else {
    await withRetry(() =>
      prisma.panel.update({
        where: { id: panelId },
        data: { status: "ERROR", responseMs: res.durationMs },
      }),
    );
  }

  await logApi({
    panelId,
    action: "balance",
    statusCode: res.status,
    durationMs: res.durationMs,
    ok: res.ok,
    response: res.error ?? res.data,
  });

  emitUpdate("panels", "low-balance", "dashboard");
  return res;
}

/** Fetch the panel's service catalogue and upsert into our Service collection. */
export async function syncServices(panelId: string) {
  const panel = await prisma.panel.findUnique({ where: { id: panelId } });
  if (!panel) throw new Error("Panel not found");

  const client = new SmmClient(panel.apiUrl, panel.apiKey);
  const res = await client.services();

  await logApi({
    panelId,
    action: "services",
    statusCode: res.status,
    durationMs: res.durationMs,
    ok: res.ok,
    response: res.ok ? { count: res.data?.length } : res.error,
  });

  // Most panels return a bare array. Some wrap it as { data: [...] } or
  // { services: [...] } — accept those too so we never drop the whole catalogue.
  let services: SmmService[] | null = null;
  if (Array.isArray(res.data)) {
    services = res.data as SmmService[];
  } else if (res.data && typeof res.data === "object") {
    const obj = res.data as Record<string, unknown>;
    const nested = obj.data ?? obj.services ?? obj.result;
    if (Array.isArray(nested)) services = nested as SmmService[];
  }

  if (!res.ok || !services) {
    await prisma.panel.update({ where: { id: panelId }, data: { status: "ERROR" } });
    return { ok: false, count: 0, error: res.error ?? "Failed to fetch services" };
  }

  let count = 0;
  let skipped = 0;
  const errors: string[] = [];

  // Normalize first, dropping records without a usable id.
  const rows = services
    .map((s) => {
      const serviceId = s.service != null ? String(s.service).trim() : "";
      if (!serviceId) return null;
      return {
        serviceId,
        data: {
          name: s.name ? String(s.name) : `Service ${serviceId}`,
          category: s.category != null ? String(s.category) : null,
          type: s.type != null ? String(s.type) : null,
          rate: parseFloat(String(s.rate)) || 0,
          min: parseInt(String(s.min)) || 1,
          max: parseInt(String(s.max)) || 100000,
          refill: Boolean(s.refill),
          cancel: Boolean(s.cancel),
          raw: s as object,
        },
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  skipped += services.length - rows.length;

  // Fast path: bulk-insert new services with createMany, and update only the
  // ones that already exist. Per-row upserts are far too slow for large
  // catalogues (10k+ services took ~12 min); this finishes in seconds.
  const existing = await prisma.service.findMany({
    where: { panelId },
    select: { serviceId: true, name: true, rate: true, min: true, max: true, category: true },
  });
  const existingMap = new Map(existing.map((e) => [e.serviceId, e]));

  const toCreate = rows.filter((r) => !existingMap.has(r.serviceId));
  // Only update existing rows whose meaningful fields actually changed — most
  // syncs change nothing, so this makes repeat syncs near-instant.
  const toUpdate = rows.filter((r) => {
    const e = existingMap.get(r.serviceId);
    if (!e) return false;
    return (
      e.name !== r.data.name ||
      e.rate !== r.data.rate ||
      e.min !== r.data.min ||
      e.max !== r.data.max ||
      e.category !== r.data.category
    );
  });
  // Existing rows that didn't change still count as imported.
  count += rows.length - toCreate.length - toUpdate.length;

  // Bulk insert all new services in large batches.
  const CREATE_BATCH = 1000;
  for (let i = 0; i < toCreate.length; i += CREATE_BATCH) {
    const batch = toCreate.slice(i, i + CREATE_BATCH);
    try {
      const r = await prisma.service.createMany({
        data: batch.map((x) => ({ panelId, serviceId: x.serviceId, ...x.data })),
      });
      count += r.count;
    } catch (err) {
      skipped += batch.length;
      if (errors.length < 5) errors.push(err instanceof Error ? err.message : "createMany failed");
    }
  }

  // Update only the changed existing services, in parallel batches.
  const UPDATE_BATCH = 200;
  for (let i = 0; i < toUpdate.length; i += UPDATE_BATCH) {
    const batch = toUpdate.slice(i, i + UPDATE_BATCH);
    const results = await Promise.allSettled(
      batch.map((r) =>
        prisma.service.updateMany({
          where: { panelId, serviceId: r.serviceId },
          data: r.data,
        }),
      ),
    );
    for (const res of results) {
      if (res.status === "fulfilled") count++;
      else skipped++;
    }
  }

  await prisma.panel.update({
    where: { id: panelId },
    data: { status: "ONLINE", lastSyncedAt: new Date() },
  });

  if (skipped > 0) {
    console.warn(
      `[syncServices] panel ${panelId}: imported ${count}, skipped ${skipped} of ${services.length}.`,
      errors,
    );
  }

  emitUpdate("panels");
  return { ok: true, count, skipped, received: services.length };
}

/** Sync balance for every enabled panel. Used by the background scheduler. */
export async function syncAllBalances() {
  const panels = await prisma.panel.findMany({
    where: { enabled: true },
    select: { id: true },
  });
  let ok = 0;
  for (const p of panels) {
    try {
      const res = await syncBalance(p.id);
      if (res.ok) ok++;
    } catch {
      /* keep going on per-panel failure */
    }
  }
  return { panels: panels.length, ok };
}

/** Sync the full service catalogue for every enabled panel. */
export async function syncAllServices() {
  const panels = await prisma.panel.findMany({
    where: { enabled: true },
    select: { id: true },
  });
  let total = 0;
  for (const p of panels) {
    try {
      const res = await syncServices(p.id);
      if (res.ok) total += res.count;
    } catch {
      /* keep going on per-panel failure */
    }
  }
  return { panels: panels.length, services: total };
}
