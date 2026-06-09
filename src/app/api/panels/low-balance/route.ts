import { prisma } from "@/lib/prisma";
import { handle, ok, requireUser } from "@/lib/api";
import { getSettings } from "@/lib/settings";

/** Panels whose balance is below the configured low-balance threshold. */
export async function GET() {
  return handle(async () => {
    await requireUser();
    const { lowBalanceThreshold } = await getSettings();

    const panels = await prisma.panel.findMany({
      where: { enabled: true, balance: { lt: lowBalanceThreshold } },
      orderBy: { balance: "asc" },
      select: { id: true, name: true, balance: true, currency: true, status: true },
    });

    return ok({ threshold: lowBalanceThreshold, count: panels.length, panels });
  });
}
