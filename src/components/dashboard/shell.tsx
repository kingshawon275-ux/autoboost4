"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { LowBalanceWatcher } from "./low-balance-watcher";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const { data: session } = useSession();
  const role = session?.user?.role;
  const canSeePanels = role === "ADMIN" || role === "MODERATOR" || session?.user?.perms?.canPanels;

  return (
    <div className="app-bg min-h-screen">
      {canSeePanels && <LowBalanceWatcher />}
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="lg:pl-72">
        <Topbar onMenu={() => setOpen(true)} />
        <main className="mx-auto w-full max-w-[1600px] px-4 py-6 lg:px-10 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
