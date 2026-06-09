"use client";

import * as React from "react";
import { motion, useInView, animate } from "framer-motion";
import {
  Activity,
  BarChart3,
  CheckCircle2,
  DollarSign,
  Heart,
  Link2,
  ListChecks,
  Server,
  Share2,
  ThumbsUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatCompact } from "@/lib/utils";
import { useCurrency } from "@/components/currency-provider";

// Server components can't pass component/function props across the RSC boundary,
// so StatCard takes an icon *name* and a format *kind* (both serializable) and
// resolves them on the client.
const ICONS: Record<string, LucideIcon> = {
  Activity,
  BarChart3,
  CheckCircle2,
  DollarSign,
  Heart,
  Link2,
  ListChecks,
  Server,
  Share2,
  ThumbsUp,
  Wallet,
};

export type StatIcon = keyof typeof ICONS;
export type StatFormat = "number" | "compact" | "currency";

function AnimatedNumber({ value, format }: { value: number; format: StatFormat }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [display, setDisplay] = React.useState(0);
  const { format: fmtMoney } = useCurrency();

  React.useEffect(() => {
    if (!inView) return;
    const controls = animate(0, value, {
      duration: 1.1,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(v),
    });
    return () => controls.stop();
  }, [inView, value]);

  // "currency" follows the app-wide currency setting (USD/BDT).
  const text =
    format === "currency"
      ? fmtMoney(display)
      : format === "compact"
        ? formatCompact(display)
        : Math.round(display).toLocaleString();

  return <span ref={ref}>{text}</span>;
}

export function StatCard({
  label,
  value,
  icon,
  format = "number",
  accent = "primary",
  hint,
  delay = 0,
}: {
  label: string;
  value: number;
  icon: StatIcon;
  format?: StatFormat;
  accent?: "primary" | "success" | "warning" | "accent";
  hint?: string;
  delay?: number;
}) {
  const Icon = ICONS[icon] ?? Activity;
  const accentMap = {
    primary: "from-primary/20 to-primary/5 text-primary",
    success: "from-success/20 to-success/5 text-success",
    warning: "from-warning/20 to-warning/5 text-warning",
    accent: "from-accent/20 to-accent/5 text-accent",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      <Card className="card-hover group relative overflow-hidden p-6">
        <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-brand-gradient opacity-[0.08] blur-2xl transition-opacity group-hover:opacity-20" />
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums">
              <AnimatedNumber value={value} format={format} />
            </p>
            {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
          </div>
          <div
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ring-1 ring-inset ring-white/10 transition-transform group-hover:scale-110",
              accentMap[accent],
            )}
          >
            <Icon className="h-6 w-6" />
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
