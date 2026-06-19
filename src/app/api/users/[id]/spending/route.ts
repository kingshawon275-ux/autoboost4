import { prisma } from "@/lib/prisma";
import { handle, ok, requireRole } from "@/lib/api";

// Per-user spending, grouped by day (Bangladesh time), plus a total.
// Returns the FULL history (every day the user spent), not just recent ones.
export async function GET(_req: Request, ctx: RouteContext<"/api/users/[id]/spending">) {
  return handle(async () => {
    await requireRole(["ADMIN"]);
    const { id } = await ctx.params;

    // Pull every (non-failed) order's cost + date. We only select two tiny
    // fields so even tens of thousands of orders stay cheap, and we page through
    // them so no arbitrary 1000-row cap hides older days.
    const byDay = new Map<string, { date: string; orders: number; spend: number }>();
    let total = 0;
    let orderCount = 0;
    const pageSize = 5000;
    let cursor: string | undefined;

    // Loop until a page returns fewer than pageSize rows (no more data).
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const page = await prisma.order.findMany({
        where: { userId: id, status: { not: "FAILED" } },
        select: { id: true, cost: true, createdAt: true },
        orderBy: { id: "asc" },
        take: pageSize,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      if (page.length === 0) break;

      for (const o of page) {
        total += o.cost;
        orderCount += 1;
        // Bangladesh-local date (YYYY-MM-DD in Asia/Dhaka = UTC+6).
        const bd = new Date(o.createdAt.getTime() + 6 * 60 * 60 * 1000);
        const key = bd.toISOString().slice(0, 10);
        const e = byDay.get(key) ?? { date: key, orders: 0, spend: 0 };
        e.orders += 1;
        e.spend += o.cost;
        byDay.set(key, e);
      }

      if (page.length < pageSize) break;
      cursor = page[page.length - 1].id;
    }

    const days = Array.from(byDay.values())
      .map((d) => ({ ...d, spend: +d.spend.toFixed(4) }))
      .sort((a, b) => b.date.localeCompare(a.date));

    return ok({ total: +total.toFixed(4), orderCount, days });
  });
}
