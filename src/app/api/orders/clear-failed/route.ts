import { prisma } from "@/lib/prisma";
import { handle, ok, requireUser } from "@/lib/api";

// Delete all FAILED orders (admins/mods: all; users: their own).
export async function POST() {
  return handle(async () => {
    const user = await requireUser();
    const where =
      user.role === "USER"
        ? { status: "FAILED" as const, userId: user.id }
        : { status: "FAILED" as const };

    const failed = await prisma.order.findMany({ where, select: { id: true } });
    const ids = failed.map((o) => o.id);
    if (ids.length === 0) return ok({ deleted: 0 });

    await prisma.orderLog.deleteMany({ where: { orderId: { in: ids } } }).catch(() => {});
    const res = await prisma.order.deleteMany({ where: { id: { in: ids } } });
    return ok({ deleted: res.count });
  });
}
