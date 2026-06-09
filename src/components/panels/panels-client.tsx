"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  RefreshCw,
  Wifi,
  Trash2,
  Pencil,
  MoreVertical,
  Server,
  Loader2,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PanelFormDialog } from "./panel-form-dialog";
import { apiFetch } from "@/lib/fetcher";
import { cn, formatCurrency, relativeTime } from "@/lib/utils";
import type { PanelDTO, PanelStatus } from "@/lib/types";

const STATUS_VARIANT: Record<PanelStatus, "success" | "secondary" | "destructive" | "warning"> = {
  ONLINE: "success",
  OFFLINE: "secondary",
  ERROR: "destructive",
  DISABLED: "warning",
};

export function PanelsClient({ canManage = true }: { canManage?: boolean }) {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<PanelDTO | null>(null);
  const [busy, setBusy] = React.useState<Record<string, string>>({});

  const { data: panels, isLoading } = useQuery({
    queryKey: ["panels"],
    queryFn: () => apiFetch<PanelDTO[]>("/api/panels"),
    refetchInterval: 60000,
  });

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiFetch<{ lowBalanceThreshold: number }>("/api/settings"),
  });
  const lowThreshold = settings?.lowBalanceThreshold ?? 10;

  function setPanelBusy(id: string, action: string | null) {
    setBusy((b) => {
      const next = { ...b };
      if (action) next[id] = action;
      else delete next[id];
      return next;
    });
  }

  const testMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/panels/${id}/test`, { method: "POST" }),
  });

  async function handleTest(id: string) {
    setPanelBusy(id, "test");
    try {
      const res = await testMutation.mutateAsync(id);
      const r = res as { ok: boolean; responseMs: number; error?: string };
      if (r.ok) toast.success(`Connected in ${r.responseMs}ms`);
      else toast.error(r.error || "Connection failed");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPanelBusy(id, null);
      qc.invalidateQueries({ queryKey: ["panels"] });
    }
  }

  async function handleSync(id: string) {
    setPanelBusy(id, "sync");
    try {
      const res = (await apiFetch(`/api/panels/${id}/sync`, { method: "POST" })) as {
        services?: { count: number; skipped: number; received: number };
      };
      const s = res.services;
      toast.success(
        s
          ? `Imported ${s.count} of ${s.received} services${s.skipped ? ` (${s.skipped} skipped)` : ""}`
          : "Synced",
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPanelBusy(id, null);
      qc.invalidateQueries({ queryKey: ["panels"] });
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this panel and all its synced services?")) return;
    try {
      await apiFetch(`/api/panels/${id}`, { method: "DELETE" });
      toast.success("Panel deleted");
      qc.invalidateQueries({ queryKey: ["panels"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div>
      <PageHeader
        title="API Panels"
        description="Connect and manage your SMM panel API integrations."
      >
        <Badge variant="success" className="gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
          </span>
          Auto-sync on
        </Badge>
        {canManage && (
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Add panel
          </Button>
        )}
      </PageHeader>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !panels?.length ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <p className="text-sm text-muted-foreground">No panels connected yet.</p>
              <Button
                variant="outline"
                onClick={() => {
                  setEditing(null);
                  setDialogOpen(true);
                }}
              >
                <Plus className="h-4 w-4" /> Add your first panel
              </Button>
            </div>
          ) : (
            <>
            {/* Mobile: stacked cards */}
            <div className="space-y-3 p-3 md:hidden">
              {panels.map((p) => (
                <div key={p.id} className="rounded-xl border border-border/60 bg-secondary/20 p-3.5">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold">{p.name}</div>
                      <div className="max-w-[200px] truncate text-xs text-muted-foreground">{p.apiUrl}</div>
                    </div>
                    <Badge variant={STATUS_VARIANT[p.status]} className="shrink-0">{p.status}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-y-1.5 text-xs">
                    <span className="text-muted-foreground">Balance</span>
                    <span className={cn("text-right font-medium tabular-nums", p.balance < lowThreshold && "text-destructive")}>
                      {formatCurrency(p.balance, p.currency)}{p.balance < lowThreshold && " · Low"}
                    </span>
                    <span className="text-muted-foreground">Services</span>
                    <span className="text-right tabular-nums">{p._count?.services ?? 0}</span>
                    <span className="text-muted-foreground">Response</span>
                    <span className="text-right tabular-nums">{p.responseMs ? `${p.responseMs}ms` : "—"}</span>
                  </div>
                  {canManage && (
                    <div className="mt-3 flex gap-2">
                      <Button variant="secondary" size="sm" className="flex-1" disabled={!!busy[p.id]} onClick={() => handleTest(p.id)}>
                        {busy[p.id] === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />} Test
                      </Button>
                      <Button variant="secondary" size="sm" className="flex-1" disabled={!!busy[p.id]} onClick={() => handleSync(p.id)}>
                        {busy[p.id] === "sync" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Sync
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => { setEditing(p); setDialogOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop: table */}
            <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Panel</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Response</TableHead>
                  <TableHead>Services</TableHead>
                  <TableHead>Synced</TableHead>
                  {canManage && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {panels.map((p) => (
                  <TableRow key={p.id} className="group">
                    <TableCell className="py-4">
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset transition-transform group-hover:scale-105",
                            p.status === "ONLINE"
                              ? "bg-brand-gradient text-white ring-white/10"
                              : "bg-secondary text-muted-foreground ring-border",
                          )}
                        >
                          <Server className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                          <div className="font-semibold">{p.name}</div>
                          <div className="max-w-[220px] truncate text-xs text-muted-foreground">
                            {p.apiUrl}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[p.status]} className="gap-1">
                        <span className={cn("h-1.5 w-1.5 rounded-full", p.status === "ONLINE" ? "bg-success" : "bg-current")} />
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {p.balance < lowThreshold ? (
                        <span className="inline-flex items-center gap-1.5 font-semibold text-destructive">
                          {formatCurrency(p.balance, p.currency)}
                          <Badge variant="destructive" className="px-1.5 py-0">Low</Badge>
                        </span>
                      ) : (
                        <span className="font-semibold">{formatCurrency(p.balance, p.currency)}</span>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {p.responseMs ? `${p.responseMs}ms` : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="tabular-nums">{(p._count?.services ?? 0).toLocaleString()}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {p.lastSyncedAt ? relativeTime(p.lastSyncedAt) : "never"}
                    </TableCell>
                    {canManage && (
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!!busy[p.id]}
                          onClick={() => handleTest(p.id)}
                        >
                          {busy[p.id] === "test" ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Wifi className="h-4 w-4" />
                          )}
                          Test
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!!busy[p.id]}
                          onClick={() => handleSync(p.id)}
                        >
                          {busy[p.id] === "sync" ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                          Sync
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                setEditing(p);
                                setDialogOpen(true);
                              }}
                            >
                              <Pencil className="h-4 w-4" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => handleDelete(p.id)}
                            >
                              <Trash2 className="h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
            </>
          )}
        </CardContent>
      </Card>

      <PanelFormDialog open={dialogOpen} onOpenChange={setDialogOpen} panel={editing} />
    </div>
  );
}
