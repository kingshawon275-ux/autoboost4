import { prisma } from "@/lib/prisma";
import { handle, ok, requireRole } from "@/lib/api";

// Toggle whether a mapping is active. Disabled mappings are skipped by the order
// routing engine, so orders won't go out through them.
export async function PATCH(req: Request, ctx: RouteContext<"/api/mappings/[id]">) {
  return handle(async () => {
    await requireRole(["ADMIN", "MODERATOR"]);
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const enabled = Boolean(body.enabled);
    const updated = await prisma.serviceMapping.update({
      where: { id },
      data: { enabled },
    });
    return ok({ id: updated.id, enabled: updated.enabled });
  });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/mappings/[id]">) {
  return handle(async () => {
    await requireRole(["ADMIN", "MODERATOR"]);
    const { id } = await ctx.params;
    await prisma.serviceMapping.delete({ where: { id } });
    return ok({ success: true });
  });
}
