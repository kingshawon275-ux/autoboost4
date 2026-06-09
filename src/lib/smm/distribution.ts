import { randomInt } from "@/lib/utils";

/**
 * Smart order distribution engine.
 *
 * Given a target quantity and a set of candidate panels (each with a mapped
 * service, cost, balance, speed and success rate), decide how much quantity
 * goes to each panel. Distribution is weighted by a composite score so that
 * faster, cheaper, more reliable panels with enough balance get more volume,
 * while respecting per-service min/max and panel affordability.
 */

export interface PanelCandidate {
  panelId: string;
  panelName: string;
  serviceId: string; // provider service id
  ratePer1000: number; // cost per 1000 units
  balance: number;
  successRate: number; // 0..100
  responseMs: number;
  priority: number; // admin preference, higher = better
  min: number;
  max: number;
}

export interface Allocation {
  panelId: string;
  panelName: string;
  serviceId: string;
  quantity: number;
  estCost: number;
}

export interface DistributionResult {
  allocations: Allocation[];
  totalAllocated: number;
  totalCost: number;
  unallocated: number;
  warnings: string[];
}

function unitCost(ratePer1000: number) {
  return ratePer1000 / 1000;
}

/** Composite desirability score for a panel (higher = better). */
function scoreOf(c: PanelCandidate): number {
  const costScore = c.ratePer1000 > 0 ? 1 / c.ratePer1000 : 1; // cheaper is better
  const speedScore = c.responseMs > 0 ? 1 / Math.max(c.responseMs, 1) : 1;
  const reliability = Math.max(c.successRate, 1) / 100;
  const priorityBoost = 1 + Math.max(c.priority, 0) * 0.25;
  return costScore * 0.4 + speedScore * 1000 * 0.2 + reliability * 0.3 + priorityBoost * 0.1;
}

/** How much quantity a panel can afford given its balance. */
function affordableQty(c: PanelCandidate): number {
  const uc = unitCost(c.serviceId ? c.ratePer1000 : c.ratePer1000);
  if (uc <= 0) return c.max;
  return Math.floor(c.balance / uc);
}

export function distribute(
  totalQuantity: number,
  candidates: PanelCandidate[],
): DistributionResult {
  const warnings: string[] = [];
  const allocations: Allocation[] = [];

  if (totalQuantity <= 0) {
    return { allocations, totalAllocated: 0, totalCost: 0, unallocated: 0, warnings };
  }
  if (candidates.length === 0) {
    warnings.push("No panels available for this service.");
    return { allocations, totalAllocated: 0, totalCost: 0, unallocated: totalQuantity, warnings };
  }

  // Build weighted shares.
  const scored = candidates.map((c) => ({ c, score: scoreOf(c), cap: Math.min(c.max, affordableQty(c)) }));
  const totalScore = scored.reduce((s, x) => s + x.score, 0) || 1;

  let remaining = totalQuantity;

  // First pass: proportional by score, clamped to [min, cap].
  for (const x of scored) {
    if (remaining <= 0) break;
    let want = Math.round((x.score / totalScore) * totalQuantity);
    want = Math.min(want, x.cap, remaining);
    if (want > 0 && want < x.c.min) {
      // Bump to min if we can afford it and still have budget.
      want = Math.min(x.c.min, x.cap, remaining);
    }
    if (want >= x.c.min && want > 0) {
      allocations.push({
        panelId: x.c.panelId,
        panelName: x.c.panelName,
        serviceId: x.c.serviceId,
        quantity: want,
        estCost: +(want * unitCost(x.c.ratePer1000)).toFixed(4),
      });
      remaining -= want;
    }
  }

  // Second pass: distribute leftovers to panels with remaining capacity,
  // best score first.
  if (remaining > 0) {
    const byScore = [...scored].sort((a, b) => b.score - a.score);
    for (const x of byScore) {
      if (remaining <= 0) break;
      const existing = allocations.find((a) => a.panelId === x.c.panelId);
      const used = existing?.quantity ?? 0;
      const headroom = x.cap - used;
      if (headroom <= 0) continue;
      const add = Math.min(headroom, remaining);
      if (existing) {
        existing.quantity += add;
        existing.estCost = +(existing.quantity * unitCost(x.c.ratePer1000)).toFixed(4);
      } else if (add >= x.c.min) {
        allocations.push({
          panelId: x.c.panelId,
          panelName: x.c.panelName,
          serviceId: x.c.serviceId,
          quantity: add,
          estCost: +(add * unitCost(x.c.ratePer1000)).toFixed(4),
        });
      } else {
        continue;
      }
      remaining -= add;
    }
  }

  if (remaining > 0) {
    warnings.push(
      `Could not allocate ${remaining} units — limited by panel balances or service max limits.`,
    );
  }

  const totalAllocated = allocations.reduce((s, a) => s + a.quantity, 0);
  const totalCost = +allocations.reduce((s, a) => s + a.estCost, 0).toFixed(4);

  return { allocations, totalAllocated, totalCost, unallocated: Math.max(remaining, 0), warnings };
}

/**
 * Resolve the effective quantity for a single boost request, supporting the
 * "random quantity" feature where the admin sets a min/max and the system
 * picks a value in range.
 */
export function resolveQuantity(opts: {
  mode: "fixed" | "random";
  fixed?: number;
  min?: number;
  max?: number;
}): number {
  if (opts.mode === "random") {
    return randomInt(opts.min ?? 0, opts.max ?? opts.min ?? 0);
  }
  return Math.max(0, Math.floor(opts.fixed ?? 0));
}
