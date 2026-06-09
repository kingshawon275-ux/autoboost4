"use client";

import * as React from "react";
import { io, type Socket } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";

// Maps a realtime channel → which React Query keys to refresh.
const CHANNEL_QUERIES: Record<string, string[][]> = {
  orders: [["orders"], ["dashboard"]],
  panels: [["panels"], ["panel-options"], ["low-balance"]],
  dashboard: [["dashboard"]],
  users: [["users"]],
  "low-balance": [["low-balance"]],
  settings: [["settings"]],
};

/**
 * Connects to the WebSocket server and, on every "update" event, invalidates
 * the matching React Query caches so the UI refreshes instantly. Polling stays
 * on as a backup (longer intervals) in case the socket drops.
 */
export function SocketProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();

  React.useEffect(() => {
    let socket: Socket | null = null;
    try {
      socket = io({ path: "/socket.io", transports: ["websocket", "polling"] });

      socket.on("update", (payload: { channel?: string }) => {
        const keys = payload?.channel ? CHANNEL_QUERIES[payload.channel] : null;
        if (keys) {
          for (const key of keys) qc.invalidateQueries({ queryKey: key });
        } else {
          // Unknown channel → refresh everything (safe fallback).
          qc.invalidateQueries();
        }
      });
    } catch {
      /* socket optional — polling backup keeps the app working */
    }

    return () => {
      socket?.disconnect();
    };
  }, [qc]);

  return <>{children}</>;
}
