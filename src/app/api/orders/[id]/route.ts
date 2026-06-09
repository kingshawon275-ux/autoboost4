import { prisma } from "@/lib/prisma";
import { handle, ok, fail, requireUser } from "@/lib/api";

export async function DELETE(_req: Request, ctx: RouteContext<"/api/orders/[id]">) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;

    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) return fail("Order not found", 404);

    // Regular users may only delete their own orders; admins/mods any.
    if (user.role === "USER" && order.userId !== user.id) {
      return fail("Forbidden", 403);
    }

    // Order logs are cleaned up too.
    await prisma.orderLog.deleteMany({ where: { orderId: id } }).catch(() => {});
    await prisma.order.delete({ where: { id } });
    return ok({ success: true });
  });
}
