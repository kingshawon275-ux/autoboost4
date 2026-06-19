import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OrdersAreaChart, ServiceUsageChart } from "@/components/dashboard/charts";
import {
  getCachedDashboardStats,
  getCachedDailySeries,
  getCachedServiceUsage,
} from "@/lib/stats";
import { guardPage } from "@/lib/guard";
import { LowBalanceAlert } from "@/components/dashboard/low-balance-alert";

// Page stays dynamic (per-user auth check), but the heavy stats queries are
// cached for a few seconds (see getCachedDashboard) so navigating here is
// instant instead of running ~10 DB aggregates on every click.
export const dynamic = "force-dynamic";

const EMPTY_STATS = {
  totalOrders: 0,
  totalLinks: 0,
  totalLikes: 0,
  totalShares: 0,
  totalReactions: 0,
  totalSpending: 0,
  activeOrders: 0,
  completedOrders: 0,
  panelBalance: 0,
  panelCount: 0,
  onlinePanels: 0,
};

export default async function DashboardPage() {
  await guardPage("/dashboard");

  let stats = EMPTY_STATS;
  let daily: { date: string; orders: number; spending: number }[] = [];
  let usage: { type: string; quantity: number; count: number }[] = [];
  let dbError = false;

  try {
    [stats, daily, usage] = await Promise.all([
      getCachedDashboardStats(),
      getCachedDailySeries(),
      getCachedServiceUsage(),
    ]);
  } catch {
    dbError = true;
  }

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Real-time overview of your SMM automation across all connected panels."
      >
        <Badge variant={dbError ? "destructive" : "success"} className="gap-1.5">
          <span className="relative flex h-2 w-2">
            {!dbError && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
            )}
            <span
              className={`relative inline-flex h-2 w-2 rounded-full ${
                dbError ? "bg-destructive" : "bg-success"
              }`}
            />
          </span>
          {dbError ? "Database offline" : "Live"}
        </Badge>
      </PageHeader>

      {!dbError && <LowBalanceAlert />}

      {dbError && (
        <Card className="mb-6 border-warning/40 bg-warning/5">
          <CardContent className="py-4 text-sm">
            <span className="font-medium text-warning">Database not connected.</span>{" "}
            <span className="text-muted-foreground">
              Set a valid <code className="rounded bg-secondary px-1">DATABASE_URL</code> (MongoDB
              Atlas) in <code className="rounded bg-secondary px-1">.env</code> and run{" "}
              <code className="rounded bg-secondary px-1">npm run seed</code>. The UI renders with
              zeroed stats until then.
            </span>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Orders" value={stats.totalOrders} icon="ListChecks" delay={0} />
        <StatCard
          label="Links Processed"
          value={stats.totalLinks}
          icon="Link2"
          accent="accent"
          delay={0.05}
        />
        <StatCard
          label="Likes Sent"
          value={stats.totalLikes}
          icon="ThumbsUp"
          format="compact"
          accent="primary"
          delay={0.1}
        />
        <StatCard
          label="Shares Sent"
          value={stats.totalShares}
          icon="Share2"
          format="compact"
          accent="success"
          delay={0.15}
        />
        <StatCard
          label="Reactions Sent"
          value={stats.totalReactions}
          icon="Heart"
          format="compact"
          accent="accent"
          delay={0.2}
        />
        <StatCard
          label="Total Spending"
          value={stats.totalSpending}
          icon="DollarSign"
          format="currency"
          accent="warning"
          delay={0.25}
        />
        <StatCard
          label="Active Orders"
          value={stats.activeOrders}
          icon="Activity"
          accent="primary"
          delay={0.3}
        />
        <StatCard
          label="Completed Orders"
          value={stats.completedOrders}
          icon="CheckCircle2"
          accent="success"
          delay={0.35}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <StatCard
          label="Total Panel Balance"
          value={stats.panelBalance}
          icon="Wallet"
          format="currency"
          accent="success"
          hint={`${stats.panelCount} panels connected`}
          delay={0.1}
        />
        <StatCard
          label="Panels Online"
          value={stats.onlinePanels}
          icon="Server"
          accent="primary"
          hint={`of ${stats.panelCount} total`}
          delay={0.15}
        />
        <StatCard
          label="Connected Panels"
          value={stats.panelCount}
          icon="Server"
          accent="accent"
          delay={0.2}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Orders & Spending</CardTitle>
            <p className="text-sm text-muted-foreground">Last 14 days</p>
          </CardHeader>
          <CardContent>
            {daily.length ? (
              <OrdersAreaChart data={daily} />
            ) : (
              <EmptyChart label="No order activity yet" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Service Usage</CardTitle>
            <p className="text-sm text-muted-foreground">Quantity by engagement type</p>
          </CardHeader>
          <CardContent>
            {usage.length ? (
              <ServiceUsageChart data={usage} />
            ) : (
              <EmptyChart label="No services used yet" />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}
