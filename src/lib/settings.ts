import { prisma } from "@/lib/prisma";

export interface CurrencySettings {
  displayCurrency: "USD" | "BDT";
  bdtRate: number;
  lowBalanceThreshold: number;
  quickQuantities: number[];
}

const DEFAULTS: CurrencySettings = {
  displayCurrency: "USD",
  bdtRate: 120,
  lowBalanceThreshold: 10,
  quickQuantities: [500, 1000, 5000, 10000],
};

/** Read the single AppSettings document, creating it with defaults if missing. */
export async function getSettings(): Promise<CurrencySettings> {
  try {
    let s = await prisma.appSettings.findFirst();
    if (!s) {
      s = await prisma.appSettings.create({ data: {} });
    }
    return {
      displayCurrency: (s.displayCurrency as "USD" | "BDT") ?? "USD",
      bdtRate: s.bdtRate ?? 120,
      lowBalanceThreshold: s.lowBalanceThreshold ?? 10,
      quickQuantities:
        s.quickQuantities?.length ? s.quickQuantities : DEFAULTS.quickQuantities,
    };
  } catch {
    return DEFAULTS;
  }
}

export async function updateSettings(patch: Partial<CurrencySettings>) {
  const existing = await prisma.appSettings.findFirst();
  if (existing) {
    return prisma.appSettings.update({
      where: { id: existing.id },
      data: {
        ...(patch.displayCurrency && { displayCurrency: patch.displayCurrency }),
        ...(patch.bdtRate != null && { bdtRate: patch.bdtRate }),
        ...(patch.lowBalanceThreshold != null && {
          lowBalanceThreshold: patch.lowBalanceThreshold,
        }),
        ...(patch.quickQuantities != null && { quickQuantities: patch.quickQuantities }),
      },
    });
  }
  return prisma.appSettings.create({
    data: {
      displayCurrency: patch.displayCurrency ?? "USD",
      bdtRate: patch.bdtRate ?? 120,
      lowBalanceThreshold: patch.lowBalanceThreshold ?? 10,
      quickQuantities: patch.quickQuantities ?? DEFAULTS.quickQuantities,
    },
  });
}
