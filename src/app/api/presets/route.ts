import { prisma } from "@/lib/prisma";
import { handle, ok, requireUser } from "@/lib/api";
import { presetSchema } from "@/lib/validators";

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const presets = await prisma.boostPreset.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
    });
    return ok(presets);
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = await req.json();
    const data = presetSchema.parse(body);

    const preset = await prisma.boostPreset.create({
      data: {
        name: data.name,
        platform: data.platform,
        panelIds: data.panelIds,
        boosts: data.boosts,
        manualMode: data.manualMode ?? false,
        manualQty: data.manualQty ?? undefined,
        panelBoosts: data.panelBoosts ?? undefined,
        userId: user.id,
      },
    });
    return ok(preset, { status: 201 });
  });
}
