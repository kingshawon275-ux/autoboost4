"use client";

import * as React from "react";
import { signOut, useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import {
  Menu,
  Bell,
  LogOut,
  User as UserIcon,
  Search,
  CheckCircle2,
  Wallet,
} from "lucide-react";
import { apiFetch } from "@/lib/fetcher";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "./theme-toggle";

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { data: session } = useSession();
  const user = session?.user;
  const canSeePanels = user?.role === "ADMIN" || user?.role === "MODERATOR" || user?.perms?.canPanels;
  const { data: lowBal } = useQuery({
    queryKey: ["low-balance"],
    queryFn: () => apiFetch<{ count: number; panels: { name: string; balance: number; currency: string }[] }>("/api/panels/low-balance"),
    refetchInterval: 120000,
    enabled: !!canSeePanels,
  });
  // Build a friendly, easy-to-read notification list from live data.
  type Notif = {
    id: string;
    tone: "warning" | "info" | "success";
    icon: React.ReactNode;
    title: string;
    detail: string;
    href?: string;
  };
  const notifs: Notif[] = [];
  for (const p of lowBal?.panels.slice(0, 6) ?? []) {
    notifs.push({
      id: `low-${p.name}`,
      tone: "warning",
      icon: <Wallet className="h-4 w-4" />,
      title: `Low balance — ${p.name}`,
      detail: `Only ${formatCurrency(p.balance, p.currency)} left. Top up soon to avoid failed orders.`,
      href: "/panels",
    });
  }
  const unreadCount = notifs.length;
  const initials = (user?.name || user?.email || "A")
    .split(/[\s@.]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  return (
    <header className="sticky top-0 z-20 flex h-20 items-center gap-3 border-b border-border/40 bg-background/60 px-4 backdrop-blur-2xl lg:px-8">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenu} aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </Button>

      {/* Search */}
      <div className="relative hidden w-full max-w-md md:block">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search orders, panels…"
          className="h-11 w-full rounded-xl border border-border/60 bg-secondary/40 pl-10 pr-4 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-primary/40 focus:bg-background focus:ring-2 focus:ring-ring/40"
        />
      </div>

      {/* Spacer pushes the controls to the right edge */}
      <div className="flex-1" />

      <div className="flex items-center gap-1.5">
        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative h-11 w-11 rounded-xl transition-colors hover:bg-secondary"
              aria-label="Notifications"
            >
              <Bell
                className={`h-5 w-5 transition-transform ${unreadCount > 0 ? "text-primary" : ""}`}
              />
              {unreadCount > 0 && (
                <>
                  {/* pulsing ring to draw the eye */}
                  <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive/60" />
                  </span>
                  <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-red-600 px-1 text-[11px] font-bold leading-none text-white shadow-md ring-2 ring-background">
                    {unreadCount}
                  </span>
                </>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[22rem] overflow-hidden p-0">
            {/* Header */}
            <div className="flex items-center justify-between bg-gradient-to-r from-primary/10 to-transparent px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
                  <Bell className="h-4 w-4 text-primary" />
                </span>
                <div>
                  <p className="text-sm font-semibold leading-none">Notifications</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {unreadCount > 0 ? `${unreadCount} need your attention` : "Everything looks good"}
                  </p>
                </div>
              </div>
              {unreadCount > 0 && (
                <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-bold text-destructive">
                  {unreadCount}
                </span>
              )}
            </div>

            <div className="max-h-[24rem] overflow-y-auto scrollbar-thin">
              {notifs.length > 0 ? (
                notifs.map((n) => {
                  const tone =
                    n.tone === "warning"
                      ? { bg: "bg-warning/15", text: "text-warning", bar: "bg-warning" }
                      : n.tone === "success"
                        ? { bg: "bg-success/15", text: "text-success", bar: "bg-success" }
                        : { bg: "bg-primary/15", text: "text-primary", bar: "bg-primary" };
                  const body = (
                    <div className="relative flex items-start gap-3 px-4 py-3 transition-colors hover:bg-secondary/50">
                      <span className={`absolute left-0 top-0 h-full w-1 ${tone.bar}`} />
                      <span
                        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone.bg} ${tone.text}`}
                      >
                        {n.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold leading-snug">{n.title}</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                          {n.detail}
                        </p>
                      </div>
                    </div>
                  );
                  return n.href ? (
                    <a key={n.id} href={n.href} className="block">
                      {body}
                    </a>
                  ) : (
                    <div key={n.id}>{body}</div>
                  );
                })
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-success/15">
                    <CheckCircle2 className="h-6 w-6 text-success" />
                  </span>
                  <p className="text-sm font-medium">You&apos;re all caught up</p>
                  <p className="text-xs text-muted-foreground">No alerts right now 🎉</p>
                </div>
              )}
            </div>

            {notifs.length > 0 && (
              <a
                href="/panels"
                className="block border-t border-border/60 py-2.5 text-center text-sm font-medium text-primary transition-colors hover:bg-secondary/50"
              >
                View all panels
              </a>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mx-1 hidden h-8 w-px bg-border/60 sm:block" />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2.5 rounded-full border border-border/60 bg-secondary/40 py-1 pl-1 pr-3 transition-colors hover:bg-secondary">
            <Avatar className="h-9 w-9 ring-2 ring-primary/20">
              <AvatarFallback>{initials || "A"}</AvatarFallback>
            </Avatar>
            <div className="hidden flex-col items-start leading-none sm:flex">
              <span className="max-w-[120px] truncate text-sm font-medium">
                {user?.name || "Admin"}
              </span>
              <span className="text-[11px] capitalize text-muted-foreground">
                {user?.role?.toLowerCase() || "user"}
              </span>
            </div>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div className="flex flex-col">
              <span className="truncate">{user?.name || "Admin"}</span>
              <span className="truncate text-xs font-normal text-muted-foreground">
                {user?.email}
              </span>
            </div>
          </DropdownMenuLabel>
          <div className="px-2 pb-1.5">
            <Badge variant="default" className="capitalize">
              {user?.role?.toLowerCase() || "user"}
            </Badge>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <a href="/settings">
              <UserIcon className="h-4 w-4" /> Account settings
            </a>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            <LogOut className="h-4 w-4" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
