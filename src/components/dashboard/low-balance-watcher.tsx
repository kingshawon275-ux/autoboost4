"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, X, Wallet, ArrowRight } from "lucide-react";
import { apiFetch } from "@/lib/fetcher";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";

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

/**
 * Premium centered low-balance alert modal. Shown once per session when any
 * panel drops below the threshold. Mounted once in the dashboard shell.
 */
export function LowBalanceWatcher() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const shownRef = React.useRef(false);

  const { data } = useQuery({
    queryKey: ["low-balance"],
    queryFn: () => apiFetch<LowResp>("/api/panels/low-balance"),
    refetchInterval: 180_000,
    retry: false,
  });

  React.useEffect(() => {
    if (!data || data.count === 0) return;
    // Show once per session (sessionStorage), unless count grows.
    const key = "ab_lowbal_shown";
    const prev = Number(sessionStorage.getItem(key) || "0");
    if (shownRef.current && data.count <= prev) return;
    if (data.count > prev || !shownRef.current) {
      shownRef.current = true;
      sessionStorage.setItem(key, String(data.count));
      setOpen(true);
    }
  }, [data]);

  if (!data || data.count === 0) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
            onClick={() => setOpen(false)}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            className="glass-strong relative z-10 w-full max-w-md overflow-hidden rounded-3xl p-7 shadow-glow-lg"
          >
            {/* Ambient glow */}
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-warning/30 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -left-10 h-44 w-44 rounded-full bg-destructive/20 blur-3xl" />

            <button
              onClick={() => setOpen(false)}
              className="absolute right-4 top-4 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Icon */}
            <div className="relative mb-5 flex justify-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-warning/30 to-warning/10 ring-1 ring-inset ring-warning/30">
                <span className="absolute inline-flex h-16 w-16 animate-ping rounded-2xl bg-warning/20" />
                <AlertTriangle className="relative h-8 w-8 text-warning" />
              </span>
            </div>

            <h2 className="text-center text-xl font-bold tracking-tight">
              Low balance warning
            </h2>
            <p className="mt-1.5 text-center text-sm text-muted-foreground">
              {data.count} panel{data.count > 1 ? "s are" : " is"} below{" "}
              {formatCurrency(data.threshold)}. Top up to avoid failed orders.
            </p>

            {/* Panel list */}
            <div className="mt-5 space-y-2">
              {data.panels.slice(0, 5).map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-xl border border-warning/20 bg-warning/5 px-3.5 py-2.5"
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Wallet className="h-4 w-4 text-warning" />
                    {p.name}
                  </span>
                  <span className="text-sm font-bold text-warning tabular-nums">
                    {formatCurrency(p.balance, p.currency)}
                  </span>
                </div>
              ))}
              {data.panels.length > 5 && (
                <p className="text-center text-xs text-muted-foreground">
                  +{data.panels.length - 5} more panel(s)
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="mt-6 flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>
                Dismiss
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  setOpen(false);
                  router.push("/panels");
                }}
              >
                <Wallet className="h-4 w-4" /> Top up panels
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
