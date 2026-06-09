import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { handle, ok, fail, requireUser } from "@/lib/api";

// Generate (or return existing) a share code for the user's preset.
export async function POST(_req: Request, ctx: RouteContext<"/api/presets/[id]/share">) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;

    const preset = await prisma.boostPreset.findUnique({ where: { id } });
    if (!preset || preset.userId !== user.id) return fail("Not found", 404);

    if (preset.shareCode) return ok({ shareCode: preset.shareCode });

    // Generate a short, unique, readable code.
    let code = "";
    for (let i = 0; i < 6; i++) {
      code = randomBytes(5).toString("hex").toUpperCase().slice(0, 8); // 8 hex chars
      const clash = await prisma.boostPreset.findFirst({ where: { shareCode: code } });
      if (!clash) break;
    }

    const updated = await prisma.boostPreset.update({
      where: { id },
      data: { shareCode: code },
    });
    return ok({ shareCode: updated.shareCode });
  });
}
