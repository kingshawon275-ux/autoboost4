// Custom Node server: Next.js + Socket.io (WebSocket) on one port.
// Run with: npm run start:server  (production)  — used on the VPS.
// Realtime: services emit events via globalThis.__io; clients subscribe and
// refresh their data instantly (no polling needed).

// Default to production when launched as the real server (npm run start:server).
// This avoids needing cross-env on the VPS — set NODE_ENV here before anything
// reads it. To run this file in dev, set NODE_ENV=development explicitly.
process.env.NODE_ENV = process.env.NODE_ENV || "production";

const { createServer } = require("http");
const next = require("next");
const { Server } = require("socket.io");

const port = parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res));

  const io = new Server(httpServer, {
    path: "/socket.io",
    cors: { origin: true, credentials: true },
  });

  io.on("connection", (socket) => {
    // Clients just listen for broadcast events; nothing required from them.
    socket.on("disconnect", () => {});
  });

  // Expose globally so API routes / services can emit (e.g. order updates).
  globalThis.__io = io;

  httpServer.listen(port, () => {
    console.log(`> Auto Boost (with realtime) ready on port ${port}`);

    // Built-in scheduler: ping our own cron endpoint on an interval. This works
    // reliably with the custom server (no Next.js instrumentation needed) and
    // drives order submission/retry + status sync. No external cron required.
    if (process.env.ENABLE_SCHEDULER === "true") {
      const secret = process.env.CRON_SECRET || "";
      const tick = async (withBalances) => {
        try {
          const q = `key=${encodeURIComponent(secret)}${withBalances ? "&balances=1" : ""}`;
          await fetch(`http://127.0.0.1:${port}/api/cron/sync?${q}`).catch(() => {});
        } catch {
          /* ignore */
        }
      };
      // Fast submit-only tick (every 5s): pushes any just-rolled-back order to
      // its panel almost immediately, so even a retried service lands fast.
      const fastTick = async () => {
        try {
          await fetch(
            `http://127.0.0.1:${port}/api/cron/sync?key=${encodeURIComponent(secret)}&submitOnly=1`,
          ).catch(() => {});
        } catch {
          /* ignore */
        }
      };
      // Keep panel connections WARM. On a remote VPS the first request to each
      // panel pays DNS + TCP + TLS (several seconds); pre-warming on an interval
      // keeps a live keep-alive socket open so real orders go out in ~1s like
      // they do locally. Hits a tiny internal endpoint that pings every panel.
      const warm = async () => {
        try {
          await fetch(
            `http://127.0.0.1:${port}/api/cron/sync?key=${encodeURIComponent(secret)}&warmup=1`,
          ).catch(() => {});
        } catch {
          /* ignore */
        }
      };

      // Full status sync + retry: every 20s. Submit-only: every 5s.
      // Warm-up: every 25s. Balances: every 5 min.
      setInterval(fastTick, 5_000);
      setInterval(warm, 25_000);
      setInterval(() => tick(false), 20_000);
      setInterval(() => tick(true), 5 * 60_000);
      setTimeout(() => warm(), 2_000); // warm connections right after boot
      setTimeout(() => tick(false), 4_000); // run shortly after boot
      console.log("> Background scheduler: submit 5s, warm 25s, status 20s, balances 5m");
    }
  });
});
