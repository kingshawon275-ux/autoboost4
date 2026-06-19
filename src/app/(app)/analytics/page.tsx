import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OrdersAreaChart, ServiceUsageChart } from "@/components/dashboard/charts";
import { Progress } from "@/components/ui/progress";
import { getDailySeries, getServiceUsage, getPanelSpending, getDailySpending } from "@/lib/stats";
import { prisma } from "@/lib/prisma";
import { PanelBalance } from "@/components/analytics/panel-balance";
import { SpendingBreakdown } from "@/components/analytics/spending-breakdown";
import { guardPage } from "@/lib/guard";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  await guardPage("/analytics");

  let daily: { date: string; orders: number; spending: number }[] = [];
  let usage: { type: string; quantity: number; count: number }[] = [];
  let panels: { id: string; name: string; successRate: number; responseMs: number; balance: number; currency: string }[] = [];
  let panelSpend: { panelId: string; name: string; spend: number; orders: number }[] = [];
  let dailySpend: { date: string; orders: number; spend: number }[] = [];
  let error = false;

  try {
    [daily, usage, panels, panelSpend, dailySpend] = await Promise.all([
      getDailySeries(30),
      getServiceUsage(),
      prisma.panel.findMany({
        select: { id: true, name: true, successRate: true, responseMs: true, balance: true, currency: true },
        orderBy: { priority: "desc" },
      }),
      getPanelSpending(),
      getDailySpending(30),
    ]);
  } catch {
    error = true;
  }

  return (
    <div>
      <PageHeader title="Analytics" description="Performance and spending insights across panels." />

      {error ? (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="py-6 text-sm text-muted-foreground">
            Connect the database to view analytics.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Orders & spending (30 days)</CardTitle>
            </CardHeader>
            <CardContent>
              {daily.length ? (
                <OrdersAreaChart data={daily} />
              ) : (
                <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
                  No data yet
                </div>
              )}
            </CardContent>
          </Card>

          {/* Panel-wise & date-wise spending (shown in your chosen currency) */}
          <SpendingBreakdown panelSpend={panelSpend} dailySpend={dailySpend} />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Service usage</CardTitle>
              </CardHeader>
              <CardContent>
                {usage.length ? (
                  <ServiceUsageChart data={usage} />
                ) : (
                  <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
                    No data yet
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Panel performance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {panels.length ? (
                  panels.map((p) => (
                    <div key={p.id}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="font-medium">{p.name}</span>
                        <span className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="secondary">{p.responseMs || 0}ms</Badge>
                          <PanelBalance usd={p.balance} />
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Progress value={p.successRate} className="flex-1" />
                        <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
                          {Math.round(p.successRate)}%
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="py-6 text-center text-sm text-muted-foreground">No panels yet.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
