import { prisma } from "@/lib/prisma";
import { handle, ok, fail, requireUser } from "@/lib/api";

export async function PATCH(req: Request, ctx: RouteContext<"/api/presets/[id]">) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;

    const preset = await prisma.boostPreset.findUnique({ where: { id } });
    if (!preset || preset.userId !== user.id) return fail("Not found", 404);

    const body = await req.json().catch(() => ({}));
    const isDefault = Boolean(body.isDefault);

    // Only one default per user — clear the others first when setting one.
    if (isDefault) {
      await prisma.boostPreset.updateMany({
        where: { userId: user.id, isDefault: true },
        data: { isDefault: false },
      });
    }

    const updated = await prisma.boostPreset.update({
      where: { id },
      data: { isDefault },
    });
    return ok(updated);
  });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/presets/[id]">) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;

    const preset = await prisma.boostPreset.findUnique({ where: { id } });
    if (!preset || preset.userId !== user.id) return fail("Not found", 404);

    await prisma.boostPreset.delete({ where: { id } });
    return ok({ success: true });
  });
}
