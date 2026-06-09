/**
 * Server-side realtime broadcast helper.
 *
 * The custom server (server.js) attaches the Socket.io instance to
 * globalThis.__io. Anywhere in server code we can call emitUpdate("orders")
 * to tell every connected client "orders changed — refresh". Clients listen
 * (see SocketProvider) and refetch the relevant data instantly.
 *
 * Safe no-op if there's no socket server (e.g. `next start` without server.js,
 * or during build) — the app still works via polling backup.
 */
export type RealtimeChannel =
  | "orders"
  | "panels"
  | "dashboard"
  | "users"
  | "low-balance"
  | "settings";

export function emitUpdate(...channels: RealtimeChannel[]) {
  try {
    const io = (globalThis as { __io?: { emit: (e: string, p?: unknown) => void } }).__io;
    if (!io) return;
    for (const ch of channels) io.emit("update", { channel: ch });
  } catch {
    /* ignore — realtime is best-effort */
  }
}
