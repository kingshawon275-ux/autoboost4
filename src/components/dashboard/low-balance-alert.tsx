"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { apiFetch } from "@/lib/fetcher";
import { formatCurrency } from "@/lib/utils";

interface LowPanel {
  id: string;
  name: string;
  balance: number;
  currency: string;
}
interface LowResp {
  threshold: number;
  count: number;
  panels: LowPanel[];
}

export function LowBalanceAlert() {
  const { data } = useQuery({
    queryKey: ["low-balance"],
    queryFn: () => apiFetch<LowResp>("/api/panels/low-balance"),
    refetchInterval: 120000,
  });

  return (
    <AnimatePresence>
      {data && data.count > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="mb-6 overflow-hidden rounded-2xl border border-warning/40 bg-warning/10 shadow-glow"
        >
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-warning/20">
                <AlertTriangle className="h-5 w-5 text-warning" />
              </span>
              <div>
                <p className="text-sm font-semibold text-warning">
                  {data.count} panel{data.count > 1 ? "s" : ""} low on balance
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Below {formatCurrency(data.threshold)} threshold:{" "}
                  {data.panels
                    .slice(0, 4)
                    .map((p) => `${p.name} (${formatCurrency(p.balance, p.currency)})`)
                    .join(", ")}
                  {data.panels.length > 4 ? ` +${data.panels.length - 4} more` : ""}
                </p>
              </div>
            </div>
            <Link
              href="/panels"
              className="inline-flex shrink-0 items-center gap-1 self-start rounded-lg border border-warning/40 bg-warning/10 px-3 py-1.5 text-xs font-medium text-warning transition-colors hover:bg-warning/20 sm:self-center"
            >
              Top up panels <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
