"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Server, CalendarDays } from "lucide-react";
import { useCurrency } from "@/components/currency-provider";
import { formatDateBD } from "@/lib/utils";

interface PanelSpend {
  panelId: string;
  name: string;
  spend: number; // USD
  orders: number;
}
interface DaySpend {
  date: string; // YYYY-MM-DD
  spend: number; // USD
  orders: number;
}

export function SpendingBreakdown({
  panelSpend,
  dailySpend,
}: {
  panelSpend: PanelSpend[];
  dailySpend: DaySpend[];
}) {
  const { format } = useCurrency();
  const grandTotal = panelSpend.reduce((s, p) => s + p.spend, 0);
  const maxPanel = Math.max(1, ...panelSpend.map((p) => p.spend));

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Panel-wise spending */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5 text-primary" /> Spending by panel
          </CardTitle>
          <span className="text-sm font-bold text-primary">{format(grandTotal)}</span>
        </CardHeader>
        <CardContent className="space-y-3">
          {panelSpend.length ? (
            panelSpend.map((p) => {
              const pct = grandTotal > 0 ? Math.round((p.spend / grandTotal) * 100) : 0;
              return (
                <div key={p.panelId}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium">{p.name}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{p.orders} orders</span>
                      <span className="font-semibold tabular-nums">{format(p.spend)}</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary to-violet-500"
                        style={{ width: `${(p.spend / maxPanel) * 100}%` }}
                      />
                    </div>
                    <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
                      {pct}%
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">No spending yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Date-wise spending */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" /> Spending by date
          </CardTitle>
        </CardHeader>
        <CardContent>
          {dailySpend.length ? (
            <div className="max-h-[22rem] space-y-1.5 overflow-y-auto scrollbar-thin pr-1">
              {dailySpend.map((d) => (
                <div
                  key={d.date}
                  className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm"
                >
                  <span className="font-medium">{formatDateBD(d.date + "T12:00:00")}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {d.orders} order{d.orders > 1 ? "s" : ""}
                    </span>
                    <span className="font-semibold tabular-nums text-foreground">
                      {format(d.spend)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">No spending yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
