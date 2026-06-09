"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, DollarSign, AlertTriangle, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { apiFetch } from "@/lib/fetcher";

interface Settings {
  displayCurrency: "USD" | "BDT";
  bdtRate: number;
  lowBalanceThreshold: number;
  quickQuantities: number[];
}

export function CurrencySettings() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiFetch<Settings>("/api/settings"),
  });

  const [rate, setRate] = React.useState("");
  const [lowBal, setLowBal] = React.useState("");
  const [quickQty, setQuickQty] = React.useState("");
  React.useEffect(() => {
    if (data) {
      setRate(String(data.bdtRate));
      setLowBal(String(data.lowBalanceThreshold ?? 10));
      setQuickQty((data.quickQuantities ?? [500, 1000, 5000, 10000]).join(", "));
    }
  }, [data]);

  const save = useMutation({
    mutationFn: (patch: Partial<Settings>) =>
      apiFetch<Settings>("/api/settings", { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Currency settings saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const showBDT = data?.displayCurrency === "BDT";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-primary" /> Currency & alerts
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Choose how order costs are shown across the app. BDT converts the provider&apos;s USD cost
          using your fixed rate.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <div>
            <p className="text-sm font-medium">Show prices in Bangladeshi Taka (৳)</p>
            <p className="text-xs text-muted-foreground">
              {showBDT ? "Currently showing BDT" : "Currently showing USD ($)"}
            </p>
          </div>
          <Switch
            checked={showBDT}
            onCheckedChange={(c) => save.mutate({ displayCurrency: c ? "BDT" : "USD" })}
            disabled={save.isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="rate">Conversion rate (1 USD = ? BDT)</Label>
          <div className="flex gap-2">
            <Input
              id="rate"
              type="number"
              min={1}
              step="0.01"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className="max-w-[200px]"
            />
            <Button
              onClick={() => save.mutate({ bdtRate: Number(rate) })}
              disabled={save.isPending || !rate}
            >
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save rate
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Example: a $1.20 order shows as ৳{(1.2 * (Number(rate) || 0)).toFixed(2)} when BDT is on.
          </p>
        </div>

        <div className="space-y-2 border-t border-border pt-5">
          <Label htmlFor="lowbal" className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" /> Low balance alert threshold
          </Label>
          <div className="flex gap-2">
            <Input
              id="lowbal"
              type="number"
              min={0}
              step="0.01"
              value={lowBal}
              onChange={(e) => setLowBal(e.target.value)}
              className="max-w-[200px]"
            />
            <Button
              onClick={() =>
                save.mutate(
                  { lowBalanceThreshold: Number(lowBal) },
                  { onSuccess: () => toast.success("Alert threshold saved") },
                )
              }
              disabled={save.isPending || lowBal === ""}
            >
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save threshold
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Any panel whose balance (in its own currency) falls below this amount will be flagged
            across the Dashboard, Panels page and notifications.
          </p>
        </div>

        <div className="space-y-2 border-t border-border pt-5">
          <Label htmlFor="quickqty" className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" /> Quick quantity buttons
          </Label>
          <div className="flex gap-2">
            <Input
              id="quickqty"
              value={quickQty}
              onChange={(e) => setQuickQty(e.target.value)}
              placeholder="500, 1000, 5000, 10000"
              className="max-w-sm"
            />
            <Button
              onClick={() => {
                const arr = quickQty
                  .split(",")
                  .map((s) => parseInt(s.trim()))
                  .filter((n) => Number.isFinite(n) && n > 0)
                  .slice(0, 8);
                if (!arr.length) return toast.error("Enter at least one number");
                save.mutate(
                  { quickQuantities: arr },
                  { onSuccess: () => toast.success("Quick quantities saved") },
                );
              }}
              disabled={save.isPending}
            >
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Comma-separated. These appear as one-click buttons under each boost&apos;s quantity on
            the Auto Boost page. Up to 8 values.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
