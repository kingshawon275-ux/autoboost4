import { prisma } from "@/lib/prisma";
import { handle, ok, requireUser } from "@/lib/api";

/** Panels with the set of boost types they have mappings for — drives the Auto Boost form. */
export async function GET() {
  return handle(async () => {
    await requireUser();
    const panels = await prisma.panel.findMany({
      where: { enabled: true },
      orderBy: [{ priority: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        balance: true,
        currency: true,
        status: true,
        responseMs: true,
        successRate: true,
      },
    });

    const mappings = await prisma.serviceMapping.findMany({
      where: { enabled: true },
      select: { panelId: true, boostType: true, platform: true },
    });

    const byPanel = new Map<string, { boostType: string; platform: string }[]>();
    for (const m of mappings) {
      const arr = byPanel.get(m.panelId) ?? [];
      arr.push({ boostType: m.boostType, platform: m.platform });
      byPanel.set(m.panelId, arr);
    }

    return ok(
      panels.map((p) => ({
        ...p,
        mappings: byPanel.get(p.id) ?? [],
      })),
    );
  });
}
