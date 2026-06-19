"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, X, Ban, CheckCircle2, Trash2, ShieldCheck, SlidersHorizontal, Wallet } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch } from "@/lib/fetcher";
import { relativeTime } from "@/lib/utils";
import { useCurrency } from "@/components/currency-provider";

interface UserRow {
  id: string;
  name: string | null;
  email: string;
  role: "ADMIN" | "MODERATOR" | "USER";
  approved: boolean;
  active: boolean;
  canDashboard: boolean;
  canAnalytics: boolean;
  canPanels: boolean;
  createdAt: string;
  totalSpend: number;
  _count: { orders: number };
}

interface SpendDetail {
  total: number;
  orderCount: number;
  days: { date: string; orders: number; spend: number }[];
}

export function UsersClient() {
  const qc = useQueryClient();
  const { format: fmtMoney } = useCurrency();
  const [permUser, setPermUser] = React.useState<UserRow | null>(null);
  const [spendUser, setSpendUser] = React.useState<UserRow | null>(null);
  const { data: users, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => apiFetch<UserRow[]>("/api/users"),
    refetchInterval: 60000,
  });

  const { data: spendDetail } = useQuery({
    queryKey: ["user-spending", spendUser?.id],
    queryFn: () => apiFetch<SpendDetail>(`/api/users/${spendUser!.id}/spending`),
    enabled: !!spendUser,
  });

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      apiFetch(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  async function remove(id: string, email: string) {
    if (!confirm(`Delete user ${email}? This cannot be undone.`)) return;
    try {
      await apiFetch(`/api/users/${id}`, { method: "DELETE" });
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success("User deleted");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const pending = users?.filter((u) => !u.approved) ?? [];
  const approved = users?.filter((u) => u.approved) ?? [];

  return (
    <div>
      <PageHeader title="Users" description="Approve registrations and manage user access.">
        {pending.length > 0 && (
          <Badge variant="warning" className="gap-1.5">
            {pending.length} pending approval
          </Badge>
        )}
      </PageHeader>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Pending approvals */}
          {pending.length > 0 && (
            <Card className="border-warning/40">
              <CardContent className="p-0">
                <div className="border-b border-border px-4 py-3 text-sm font-semibold text-warning">
                  Awaiting approval ({pending.length})
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Registered</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pending.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell>
                          <div className="font-medium">{u.name || "—"}</div>
                          <div className="text-xs text-muted-foreground">{u.email}</div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {relativeTime(u.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="success"
                              disabled={patch.isPending}
                              onClick={() =>
                                patch.mutate(
                                  { id: u.id, body: { approved: true } },
                                  { onSuccess: () => toast.success(`Approved ${u.email}`) },
                                )
                              }
                            >
                              <Check className="h-4 w-4" /> Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => remove(u.id, u.email)}
                            >
                              <X className="h-4 w-4" /> Reject
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* All approved users */}
          <Card>
            <CardContent className="p-0">
              {/* Mobile: stacked cards */}
              <div className="space-y-3 p-3 md:hidden">
                {approved.length ? (
                  approved.map((u) => (
                    <div key={u.id} className="rounded-xl border border-border/60 bg-secondary/20 p-3.5">
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold">{u.name || "—"}</div>
                          <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                        </div>
                        <Badge variant={u.role === "ADMIN" ? "default" : "secondary"}>{u.role}</Badge>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        {u.active ? (
                          <Badge variant="success">Active</Badge>
                        ) : (
                          <Badge variant="destructive">Disabled</Badge>
                        )}
                        <span className="text-muted-foreground">{u._count.orders} orders</span>
                      </div>
                      <button
                        onClick={() => setSpendUser(u)}
                        className="mt-2 flex w-full items-center justify-between rounded-lg border border-border/60 bg-secondary/30 px-3 py-2 text-sm"
                      >
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <Wallet className="h-4 w-4" /> Total spend
                        </span>
                        <span className="font-bold text-primary">{fmtMoney(u.totalSpend)}</span>
                      </button>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {u.role === "USER" && (
                          <Button size="sm" variant="secondary" className="flex-1" onClick={() => setPermUser(u)}>
                            <SlidersHorizontal className="h-4 w-4" /> Permissions
                          </Button>
                        )}
                        {u.active ? (
                          <Button size="sm" variant="outline" onClick={() => patch.mutate({ id: u.id, body: { active: false } }, { onSuccess: () => toast.success("Disabled") })}>
                            <Ban className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => patch.mutate({ id: u.id, body: { active: true } }, { onSuccess: () => toast.success("Enabled") })}>
                            <CheckCircle2 className="h-4 w-4" />
                          </Button>
                        )}
                        <Button size="sm" variant="outline" className="text-destructive" onClick={() => remove(u.id, u.email)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="py-8 text-center text-sm text-muted-foreground">No approved users yet.</p>
                )}
              </div>

              {/* Desktop: table */}
              <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Orders</TableHead>
                    <TableHead>Total spend</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {approved.length ? (
                    approved.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell>
                          <div className="font-medium">{u.name || "—"}</div>
                          <div className="text-xs text-muted-foreground">{u.email}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={u.role === "ADMIN" ? "default" : "secondary"}>
                            {u.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {u.active ? (
                            <Badge variant="success">Active</Badge>
                          ) : (
                            <Badge variant="destructive">Disabled</Badge>
                          )}
                        </TableCell>
                        <TableCell className="tabular-nums">{u._count.orders}</TableCell>
                        <TableCell>
                          <button
                            onClick={() => setSpendUser(u)}
                            className="font-semibold tabular-nums text-primary hover:underline"
                            title="View spending details"
                          >
                            {fmtMoney(u.totalSpend)}
                          </button>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {u.role === "USER" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                title="Permissions"
                                onClick={() => setPermUser(u)}
                              >
                                <SlidersHorizontal className="h-4 w-4" />
                              </Button>
                            )}
                            {u.role !== "ADMIN" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                title="Make admin"
                                onClick={() =>
                                  patch.mutate(
                                    { id: u.id, body: { role: "ADMIN" } },
                                    { onSuccess: () => toast.success("Promoted to admin") },
                                  )
                                }
                              >
                                <ShieldCheck className="h-4 w-4" />
                              </Button>
                            )}
                            {u.active ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                title="Disable"
                                onClick={() =>
                                  patch.mutate(
                                    { id: u.id, body: { active: false } },
                                    { onSuccess: () => toast.success("User disabled") },
                                  )
                                }
                              >
                                <Ban className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                title="Enable"
                                onClick={() =>
                                  patch.mutate(
                                    { id: u.id, body: { active: true } },
                                    { onSuccess: () => toast.success("User enabled") },
                                  )
                                }
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              title="Delete"
                              onClick={() => remove(u.id, u.email)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                        No approved users yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Per-user permissions dialog */}
      <Dialog open={!!permUser} onOpenChange={(o) => !o && setPermUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Permissions — {permUser?.name || permUser?.email}</DialogTitle>
            <DialogDescription>
              By default a user only sees Auto Boost and Order Status. Grant extra pages below.
              API keys and admin settings are never visible to users.
            </DialogDescription>
          </DialogHeader>

          {permUser && (
            <div className="space-y-3">
              {([
                { key: "canDashboard", label: "Dashboard (stats, spending, orders)" },
                { key: "canAnalytics", label: "Analytics (charts & performance)" },
                { key: "canPanels", label: "Panels (view only — no API keys, no editing)" },
              ] as const).map((row) => (
                <div
                  key={row.key}
                  className="flex items-center justify-between rounded-lg border border-border p-3"
                >
                  <span className="text-sm font-medium">{row.label}</span>
                  <Switch
                    checked={permUser[row.key]}
                    onCheckedChange={(c) => {
                      setPermUser({ ...permUser, [row.key]: c });
                      patch.mutate(
                        { id: permUser.id, body: { [row.key]: c } },
                        { onSuccess: () => toast.success("Permission updated") },
                      );
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Per-user spending detail dialog */}
      <Dialog open={!!spendUser} onOpenChange={(o) => !o && setSpendUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Spending — {spendUser?.name || spendUser?.email}</DialogTitle>
            <DialogDescription>
              Full date-wise spending history (Bangladesh time)
              {spendDetail ? ` — ${spendDetail.days.length} day(s)` : ""}.
            </DialogDescription>
          </DialogHeader>

          {spendDetail ? (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-border bg-secondary/30 p-3">
                  <p className="text-xs text-muted-foreground">Total spend</p>
                  <p className="mt-1 text-xl font-bold text-primary">
                    {fmtMoney(spendDetail.total)}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-secondary/30 p-3">
                  <p className="text-xs text-muted-foreground">Total orders</p>
                  <p className="mt-1 text-xl font-bold tabular-nums">{spendDetail.orderCount}</p>
                </div>
              </div>

              {/* Date-wise — full history, scrollable */}
              <div className="max-h-[26rem] space-y-1.5 overflow-y-auto scrollbar-thin pr-1">
                {spendDetail.days.length ? (
                  spendDetail.days.map((d) => (
                    <div
                      key={d.date}
                      className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm"
                    >
                      <span className="font-medium">
                        {new Date(d.date + "T00:00:00").toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                      <span className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{d.orders} order{d.orders > 1 ? "s" : ""}</span>
                        <span className="font-bold text-foreground">{fmtMoney(d.spend)}</span>
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="py-6 text-center text-sm text-muted-foreground">No spending yet.</p>
                )}
              </div>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
