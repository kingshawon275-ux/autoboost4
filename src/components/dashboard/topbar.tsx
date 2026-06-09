"use client";

import * as React from "react";
import { signOut, useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { Menu, Bell, LogOut, User as UserIcon, Search, AlertTriangle } from "lucide-react";
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
  const lowCount = lowBal?.count ?? 0;
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
            <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
              <Bell className="h-5 w-5" />
              {lowCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-white ring-2 ring-background">
                  {lowCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel>Notifications</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {lowCount > 0 ? (
              <>
                {lowBal?.panels.slice(0, 6).map((p, i) => (
                  <div key={i} className="flex items-start gap-2.5 px-2 py-2">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-warning/15">
                      <AlertTriangle className="h-4 w-4 text-warning" />
                    </span>
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-medium">Low balance: {p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(p.balance, p.currency)} remaining
                      </p>
                    </div>
                  </div>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <a href="/panels" className="justify-center text-primary">View all panels</a>
                </DropdownMenuItem>
              </>
            ) : (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                You&apos;re all caught up 🎉
              </p>
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
