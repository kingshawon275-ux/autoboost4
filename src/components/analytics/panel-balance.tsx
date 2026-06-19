"use client";

import { useCurrency } from "@/components/currency-provider";

// Show a panel balance (provider value is USD) in the user's chosen currency.
export function PanelBalance({ usd }: { usd: number }) {
  const { format } = useCurrency();
  return <>{format(usd)}</>;
}
