import { prisma } from "@/lib/prisma";
import { handle, ok, requireRole } from "@/lib/api";

// Per-user spending, grouped by day (Bangladesh time), plus a total.
export async function GET(_req: Request, ctx: RouteContext<"/api/users/[id]/spending">) {
  return handle(async () => {
    await requireRole(["ADMIN"]);
    const { id } = await ctx.params;

    const orders = await prisma.order.findMany({
      where: { userId: id, status: { not: "FAILED" } },
      select: { cost: true, boostType: true, quantity: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 1000,
    });

    // Group by Bangladesh-local date (YYYY-MM-DD in Asia/Dhaka = UTC+6).
    const byDay = new Map<string, { date: string; orders: number; spend: number }>();
    let total = 0;
    for (const o of orders) {
      total += o.cost;
      const bd = new Date(o.createdAt.getTime() + 6 * 60 * 60 * 1000);
      const key = bd.toISOString().slice(0, 10);
      const e = byDay.get(key) ?? { date: key, orders: 0, spend: 0 };
      e.orders += 1;
      e.spend += o.cost;
      byDay.set(key, e);
    }

    const days = Array.from(byDay.values())
      .map((d) => ({ ...d, spend: +d.spend.toFixed(4) }))
      .sort((a, b) => b.date.localeCompare(a.date));

    return ok({ total: +total.toFixed(4), orderCount: orders.length, days });
  });
}
