"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/fetcher";

interface CurrencyState {
  displayCurrency: "USD" | "BDT";
  bdtRate: number;
  /** Format a USD amount into the active display currency. */
  format: (usdAmount: number) => string;
}

const CurrencyContext = React.createContext<CurrencyState>({
  displayCurrency: "USD",
  bdtRate: 120,
  format: (n) => `$${n.toFixed(2)}`,
});

export function useCurrency() {
  return React.useContext(CurrencyContext);
}

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const { data } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiFetch<{ displayCurrency: "USD" | "BDT"; bdtRate: number }>("/api/settings"),
    staleTime: 60_000,
    // Settings only matter once logged in; a 401 just falls back to defaults.
    retry: false,
  });

  const displayCurrency = data?.displayCurrency ?? "USD";
  const bdtRate = data?.bdtRate ?? 120;

  const format = React.useCallback(
    (usdAmount: number) => {
      if (displayCurrency === "BDT") {
        const bdt = usdAmount * bdtRate;
        return new Intl.NumberFormat("en-BD", {
          style: "currency",
          currency: "BDT",
          maximumFractionDigits: 2,
        }).format(bdt);
      }
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }).format(usdAmount);
    },
    [displayCurrency, bdtRate],
  );

  return (
    <CurrencyContext.Provider value={{ displayCurrency, bdtRate, format }}>
      {children}
    </CurrencyContext.Provider>
  );
}
