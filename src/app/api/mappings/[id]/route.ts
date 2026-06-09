import { prisma } from "@/lib/prisma";
import { handle, ok, requireRole } from "@/lib/api";

export async function DELETE(_req: Request, ctx: RouteContext<"/api/mappings/[id]">) {
  return handle(async () => {
    await requireRole(["ADMIN", "MODERATOR"]);
    const { id } = await ctx.params;
    await prisma.serviceMapping.delete({ where: { id } });
    return ok({ success: true });
  });
}
