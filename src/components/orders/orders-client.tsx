"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RefreshCw, Loader2, ExternalLink, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch } from "@/lib/fetcher";
import { formatDateTimeBD } from "@/lib/utils";
import { useCurrency } from "@/components/currency-provider";
import { ORDER_STATUS_META } from "@/lib/constants";
import type { OrderDTO } from "@/lib/types";

const FILTERS = [
  { value: "ALL", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "PROCESSING", label: "Processing" },
  { value: "PARTIAL", label: "Partial" },
  { value: "COMPLETED", label: "Completed" },
  { value: "FAILED", label: "Failed" },
];

function progressOf(o: OrderDTO) {
  if (o.quantity <= 0) return 0;
  const done = o.quantity - o.remains;
  return Math.max(0, Math.min(100, Math.round((done / o.quantity) * 100)));
}

export function OrdersClient() {
  const qc = useQueryClient();
  const { format: fmtMoney } = useCurrency();
  const [filter, setFilter] = React.useState("ALL");

  const { data: orders, isLoading } = useQuery({
    queryKey: ["orders", filter],
    queryFn: () =>
      apiFetch<OrderDTO[]>(`/api/orders${filter !== "ALL" ? `?status=${filter}` : ""}`),
    // Poll the (lightweight) list every 30s. Heavy provider sync is on the cron,
    // not on every poll — keeps server resource usage low.
    refetchInterval: 30000,
  });

  // Manual "Sync statuses" button still triggers an immediate provider sync.
  const refresh = useMutation({
    mutationFn: () => apiFetch<{ updated: number }>("/api/orders/refresh", { method: "POST" }),
    onSuccess: (res) => {
      toast.success(`Refreshed — ${res.updated} order(s) updated`);
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function deleteOrder(id: string) {
    try {
      await apiFetch(`/api/orders/${id}`, { method: "DELETE" });
      qc.invalidateQueries({ queryKey: ["orders"] });
      toast.success("Order deleted");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const clearByStatus = useMutation({
    mutationFn: (status: string) =>
      apiFetch<{ deleted: number }>(`/api/orders/clear?status=${status}`, { method: "POST" }),
    onSuccess: (res) => {
      toast.success(`Cleared ${res.deleted} order(s)`);
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const hasFailed = (orders ?? []).some((o) => o.status === "FAILED");
  const hasPartial = (orders ?? []).some((o) => o.status === "PARTIAL");

  return (
    <div>
      <PageHeader
        title="Orders"
        description="Monitor order status across all panels in near real time."
      >
        {hasFailed && (
          <Button
            variant="outline"
            onClick={() => {
              if (confirm("Delete all failed orders?")) clearByStatus.mutate("FAILED");
            }}
            disabled={clearByStatus.isPending}
            className="text-destructive"
          >
            {clearByStatus.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Clear failed
          </Button>
        )}
        {hasPartial && (
          <Button
            variant="outline"
            onClick={() => {
              if (confirm("Delete all partial orders?")) clearByStatus.mutate("PARTIAL");
            }}
            disabled={clearByStatus.isPending}
            className="text-amber-600 dark:text-amber-500"
          >
            {clearByStatus.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Clear partial
          </Button>
        )}
        <Button variant="secondary" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
          {refresh.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Sync statuses
        </Button>
      </PageHeader>

      <Tabs value={filter} onValueChange={setFilter} className="mb-4">
        <TabsList className="flex-wrap">
          {FILTERS.map((f) => (
            <TabsTrigger key={f.value} value={f.value}>
              {f.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !orders?.length ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              No orders found for this filter.
            </div>
          ) : (
            <>
            {/* Mobile: stacked cards */}
            <div className="space-y-3 p-3 md:hidden">
              {orders.map((o) => {
                const meta = ORDER_STATUS_META[o.status] ?? { label: o.status, variant: "secondary" as const };
                const pct = progressOf(o);
                return (
                  <div key={o.id} className="rounded-xl border border-border/60 bg-secondary/20 p-3.5">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-sm font-semibold">
                          {o.boostType}
                          <span className="text-xs font-normal text-muted-foreground">× {o.quantity.toLocaleString()}</span>
                        </div>
                        <a href={o.postUrl} target="_blank" rel="noreferrer" className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
                          <span className="max-w-[180px] truncate">{o.postUrl}</span>
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                      </div>
                      <Badge variant={meta.variant} className="shrink-0">{meta.label}</Badge>
                    </div>
                    <div className="mb-2 flex items-center gap-2">
                      <Progress value={pct} className="flex-1" />
                      <span className="text-xs tabular-nums text-muted-foreground">{pct}%</span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>{o.panel?.name ?? "—"}</span>
                      <span className="font-medium text-foreground">{fmtMoney(o.cost)}</span>
                      <span>{formatDateTimeBD(o.createdAt)}</span>
                    </div>
                    {o.errorMessage && (
                      <p className="mt-1.5 text-xs text-destructive">{o.errorMessage}</p>
                    )}
                    {o.status === "FAILED" && (
                      <button
                        onClick={() => deleteOrder(o.id)}
                        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-destructive hover:underline"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Desktop: table */}
            <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Panel</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => {
                  const meta = ORDER_STATUS_META[o.status] ?? {
                    label: o.status,
                    variant: "secondary" as const,
                  };
                  const pct = progressOf(o);
                  return (
                    <TableRow key={o.id}>
                      <TableCell>
                        <a
                          href={o.postUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex max-w-[200px] items-center gap-1 truncate text-sm font-medium hover:text-primary"
                        >
                          <span className="truncate">{o.postUrl}</span>
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                        <span className="font-mono text-xs text-muted-foreground">
                          #{o.providerOrderId ?? o.id.slice(-6)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">{o.boostType}</div>
                        <div className="text-xs text-muted-foreground tabular-nums">
                          {o.quantity.toLocaleString()} qty
                        </div>
                      </TableCell>
                      <TableCell className="w-44">
                        <div className="flex items-center gap-2">
                          <Progress value={pct} className="w-24" />
                          <span className="text-xs tabular-nums text-muted-foreground">{pct}%</span>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                          {o.remains.toLocaleString()} remaining
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{o.panel?.name ?? "—"}</TableCell>
                      <TableCell className="text-sm tabular-nums">{fmtMoney(o.cost)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant={meta.variant}>{meta.label}</Badge>
                          {o.status === "FAILED" && (
                            <button
                              onClick={() => deleteOrder(o.id)}
                              title="Delete failed order"
                              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        {o.errorMessage && (
                          <div
                            className="mt-1 max-w-[160px] truncate text-xs text-destructive"
                            title={o.errorMessage}
                          >
                            {o.errorMessage}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDateTimeBD(o.createdAt)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
