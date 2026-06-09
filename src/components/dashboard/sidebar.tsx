"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Rocket,
  ListChecks,
  Server,
  BarChart3,
  Settings,
  Users,
  Zap,
  X,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_GROUPS } from "@/lib/constants";
import { canView } from "@/lib/permissions";

const ICONS = {
  LayoutDashboard,
  Rocket,
  ListChecks,
  Server,
  BarChart3,
  Settings,
  Users,
} as const;

export function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = session?.user?.role;
  const perms = session?.user?.perms;
  const isAdmin = role === "ADMIN";

  const groups = NAV_GROUPS.map((g) => ({
    heading: g.heading,
    items: g.items.filter((item) => {
      if ("adminOnly" in item && item.adminOnly) return isAdmin;
      return canView(item.href, role, perms);
    }),
  })).filter((g) => g.items.length > 0);

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-border/40 bg-sidebar/60 text-sidebar-foreground backdrop-blur-2xl transition-transform duration-300 lg:translate-x-0",
          "before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:bg-[radial-gradient(at_top_left,hsl(var(--grad-from)/0.12),transparent_60%)]",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Brand */}
        <div className="flex h-20 items-center justify-between gap-2 border-b border-border/40 px-6">
          <Link href="/dashboard" className="group flex items-center gap-3">
            <span className="glow-ring flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-gradient shadow-glow">
              <Zap className="h-6 w-6 text-white" />
            </span>
            <div className="flex flex-col leading-none">
              <span className="text-xl font-bold tracking-tight">
                Auto<span className="text-brand-gradient">Boost</span>
              </span>
              <span className="mt-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                SMM Platform
              </span>
            </div>
          </Link>
          <button
            className="text-muted-foreground lg:hidden"
            onClick={onClose}
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav groups */}
        <nav className="flex-1 space-y-6 overflow-y-auto px-4 py-2 scrollbar-thin">
          {groups.map((group) => (
            <div key={group.heading}>
              <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
                {group.heading}
              </p>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = ICONS[item.icon as keyof typeof ICONS];
                  const active =
                    pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors",
                        active
                          ? "text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {active && (
                        <motion.span
                          layoutId="sidebar-active"
                          className="absolute inset-0 rounded-xl bg-primary/10 ring-1 ring-primary/25 shadow-glow"
                          transition={{ type: "spring", stiffness: 380, damping: 32 }}
                        />
                      )}
                      {/* Icon badge */}
                      <span
                        className={cn(
                          "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all",
                          active
                            ? "bg-brand-gradient text-white shadow-glow"
                            : "bg-secondary/70 text-muted-foreground group-hover:bg-secondary group-hover:text-foreground",
                        )}
                      >
                        <Icon className="h-[18px] w-[18px]" />
                      </span>
                      <span className="relative flex-1">{item.label}</span>
                      {"badge" in item && item.badge && (
                        <span className="relative rounded-md bg-brand-gradient px-1.5 py-0.5 text-[10px] font-bold text-white">
                          {item.badge}
                        </span>
                      )}
                      {active && (
                        <ChevronRight className="relative h-4 w-4 text-primary" />
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer card */}
        <div className="p-4">
          <div className="gradient-border relative overflow-hidden rounded-2xl bg-card/60 p-4 backdrop-blur">
            <div className="absolute -right-4 -top-4 h-16 w-16 rounded-full bg-brand-gradient opacity-20 blur-2xl" />
            <p className="text-sm font-semibold">Premium SaaS</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Multi-panel SMM automation
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
