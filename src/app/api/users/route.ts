import { prisma } from "@/lib/prisma";
import { handle, ok, requireRole } from "@/lib/api";

export async function GET() {
  return handle(async () => {
    await requireRole(["ADMIN"]);
    const users = await prisma.user.findMany({
      orderBy: [{ approved: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        approved: true,
        active: true,
        canDashboard: true,
        canAnalytics: true,
        canPanels: true,
        createdAt: true,
        _count: { select: { orders: true } },
      },
    });

    // Total spend per user (only orders that actually went through — not FAILED).
    const spendByUser = await prisma.order.groupBy({
      by: ["userId"],
      where: { status: { not: "FAILED" } },
      _sum: { cost: true },
    });
    const spendMap = new Map(spendByUser.map((s) => [s.userId, s._sum.cost ?? 0]));

    return ok(
      users.map((u) => ({ ...u, totalSpend: +(spendMap.get(u.id) ?? 0).toFixed(4) })),
    );
  });
}
