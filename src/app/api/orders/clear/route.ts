import { prisma } from "@/lib/prisma";
import { handle, ok, requireUser } from "@/lib/api";
import type { OrderStatus } from "@prisma/client";

// Delete all orders of a given status (admins/mods: all; users: their own).
// Only "finished" statuses can be bulk-cleared so live orders aren't wiped.
const CLEARABLE: OrderStatus[] = ["FAILED", "PARTIAL", "CANCELED", "COMPLETED"];

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const { searchParams } = new URL(req.url);
    const status = (searchParams.get("status") ?? "").toUpperCase() as OrderStatus;

    if (!CLEARABLE.includes(status)) {
      throw new Error(`Cannot clear status "${status}". Allowed: ${CLEARABLE.join(", ")}`);
    }

    const where =
      user.role === "USER"
        ? { status, userId: user.id }
        : { status };

    const rows = await prisma.order.findMany({ where, select: { id: true } });
    const ids = rows.map((o) => o.id);
    if (ids.length === 0) return ok({ deleted: 0 });

    await prisma.orderLog.deleteMany({ where: { orderId: { in: ids } } }).catch(() => {});
    const res = await prisma.order.deleteMany({ where: { id: { in: ids } } });
    return ok({ deleted: res.count });
  });
}
