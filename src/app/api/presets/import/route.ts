import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, ok, fail, requireUser } from "@/lib/api";

const schema = z.object({ code: z.string().min(1) });

// Import a shared preset by code → creates an independent copy for the user.
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const { code } = schema.parse(await req.json());

    const source = await prisma.boostPreset.findFirst({
      where: { shareCode: code.trim().toUpperCase() },
    });
    if (!source) return fail("Invalid share code", 404);

    const copy = await prisma.boostPreset.create({
      data: {
        name: `${source.name} (imported)`,
        platform: source.platform,
        panelIds: source.panelIds,
        boosts: source.boosts as object,
        manualMode: source.manualMode,
        manualQty: (source.manualQty as object) ?? undefined,
        panelBoosts: (source.panelBoosts as object) ?? undefined,
        isDefault: false,
        shareCode: null, // the copy is private until re-shared
        userId: user.id,
      },
    });
    return ok({ id: copy.id, name: copy.name }, { status: 201 });
  });
}
