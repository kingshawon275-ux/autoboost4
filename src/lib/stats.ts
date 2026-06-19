import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

export interface DashboardStats {
  totalOrders: number;
  totalLinks: number;
  totalLikes: number;
  totalShares: number;
  totalReactions: number;
  totalSpending: number;
  activeOrders: number;
  completedOrders: number;
  panelBalance: number;
  panelCount: number;
  onlinePanels: number;
}

const REACTION_TYPES = ["LOVE", "WOW", "CARE", "HAHA", "ANGRY"] as const;

export async function getDashboardStats(): Promise<DashboardStats> {
  const [
    totalOrders,
    activeOrders,
    completedOrders,
    likesAgg,
    sharesAgg,
    reactionsAgg,
    spendAgg,
    distinctLinks,
    panels,
  ] = await Promise.all([
    prisma.order.count(),
    prisma.order.count({ where: { status: { in: ["PENDING", "PROCESSING", "PARTIAL"] } } }),
    prisma.order.count({ where: { status: "COMPLETED" } }),
    prisma.order.aggregate({ where: { boostType: "LIKE" }, _sum: { quantity: true } }),
    prisma.order.aggregate({ where: { boostType: "SHARE" }, _sum: { quantity: true } }),
    prisma.order.aggregate({
      where: { boostType: { in: [...REACTION_TYPES] } },
      _sum: { quantity: true },
    }),
    prisma.order.aggregate({ _sum: { cost: true } }),
    // Distinct post URLs. Use a server-side groupBy (count of groups) instead of
    // pulling every order's postUrl into memory — the old findMany scanned the
    // whole orders collection and was the main dashboard slowdown.
    prisma.order.groupBy({ by: ["postUrl"], _count: true }),
    prisma.panel.findMany({ select: { balance: true, status: true } }),
  ]);

  return {
    totalOrders,
    totalLinks: distinctLinks.length,
    totalLikes: likesAgg._sum.quantity ?? 0,
    totalShares: sharesAgg._sum.quantity ?? 0,
    totalReactions: reactionsAgg._sum.quantity ?? 0,
    totalSpending: +(spendAgg._sum.cost ?? 0).toFixed(2),
    activeOrders,
    completedOrders,
    panelBalance: +panels.reduce((s, p) => s + p.balance, 0).toFixed(2),
    panelCount: panels.length,
    onlinePanels: panels.filter((p) => p.status === "ONLINE").length,
  };
}

/** Orders & spending grouped by day for the last N days. */
export async function getDailySeries(days = 14) {
  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  since.setHours(0, 0, 0, 0);

  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: since } },
    select: { createdAt: true, cost: true },
  });

  const buckets = new Map<string, { orders: number; spending: number }>();
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    buckets.set(d.toISOString().slice(0, 10), { orders: 0, spending: 0 });
  }
  for (const o of orders) {
    const key = o.createdAt.toISOString().slice(0, 10);
    const b = buckets.get(key);
    if (b) {
      b.orders += 1;
      b.spending += o.cost;
    }
  }

  return Array.from(buckets.entries()).map(([date, v]) => ({
    date: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    orders: v.orders,
    spending: +v.spending.toFixed(2),
  }));
}

/** Quantity grouped by boost/service type. */
export async function getServiceUsage() {
  const grouped = await prisma.order.groupBy({
    by: ["boostType"],
    _sum: { quantity: true },
    _count: true,
  });
  return grouped
    .map((g) => ({
      type: g.boostType,
      quantity: g._sum.quantity ?? 0,
      count: g._count,
    }))
    .sort((a, b) => b.quantity - a.quantity);
}

/** Total spending grouped by panel (across all time). Cost is in USD. */
export async function getPanelSpending() {
  const [grouped, panels] = await Promise.all([
    prisma.order.groupBy({
      by: ["panelId"],
      where: { status: { not: "FAILED" } },
      _sum: { cost: true },
      _count: true,
    }),
    prisma.panel.findMany({ select: { id: true, name: true, currency: true } }),
  ]);
  const nameOf = new Map(panels.map((p) => [p.id, p.name]));
  return grouped
    .map((g) => ({
      panelId: g.panelId,
      name: nameOf.get(g.panelId) ?? "Unknown panel",
      spend: +(g._sum.cost ?? 0).toFixed(4),
      orders: g._count,
    }))
    .sort((a, b) => b.spend - a.spend);
}

/** Spending grouped by Bangladesh-local day for the last N days. Cost in USD. */
export async function getDailySpending(days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  since.setHours(0, 0, 0, 0);

  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: since }, status: { not: "FAILED" } },
    select: { createdAt: true, cost: true },
  });

  const byDay = new Map<string, { date: string; orders: number; spend: number }>();
  for (const o of orders) {
    // Bangladesh-local date (Asia/Dhaka = UTC+6).
    const bd = new Date(o.createdAt.getTime() + 6 * 60 * 60 * 1000);
    const key = bd.toISOString().slice(0, 10);
    const e = byDay.get(key) ?? { date: key, orders: 0, spend: 0 };
    e.orders += 1;
    e.spend += o.cost;
    byDay.set(key, e);
  }
  return Array.from(byDay.values())
    .map((d) => ({ ...d, spend: +d.spend.toFixed(4) }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

// Cached variants — used by the dashboard so navigating to it is instant.
// The stats are global (admin overview), so a short shared cache is safe; live
// changes still surface via the realtime socket + client polling, and the cache
// auto-refreshes every 15s.
export const getCachedDashboardStats = unstable_cache(getDashboardStats, ["dashboard-stats"], {
  revalidate: 15,
});
export const getCachedDailySeries = unstable_cache(
  () => getDailySeries(14),
  ["dashboard-daily"],
  { revalidate: 15 },
);
export const getCachedServiceUsage = unstable_cache(getServiceUsage, ["dashboard-usage"], {
  revalidate: 15,
});
