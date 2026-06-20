import { handle, ok, fail } from "@/lib/api";
import { refreshOrderStatuses, submitPendingOrders } from "@/lib/smm/order-service";
import { syncAllBalances } from "@/lib/smm/panel-service";

// Cron endpoint — submits pending orders, retries failures, syncs statuses.
// Triggered automatically by Vercel Cron (see vercel.json) which sends
//   Authorization: Bearer <CRON_SECRET>
// You can also call it manually / from cron-job.org:
//   GET https://yourdomain.com/api/cron/sync?key=YOUR_CRON_SECRET&balances=1
//
// Runs every few minutes on Vercel free, every minute on Pro.
export const maxDuration = 60;

async function run(req: Request) {
  return handle(async () => {
    const url = new URL(req.url);
    const secret = process.env.CRON_SECRET;

    // Accept either the Vercel cron Authorization header or a ?key= param.
    const authHeader = req.headers.get("authorization") || "";
    const bearerOk = secret ? authHeader === `Bearer ${secret}` : false;
    const keyOk = secret ? url.searchParams.get("key") === secret : false;
    // Vercel sets x-vercel-cron header on its own cron invocations.
    const isVercelCron = req.headers.get("x-vercel-cron") != null;

    if (!secret || !(bearerOk || keyOk || isVercelCron)) {
      return fail("Unauthorized", 401);
    }

    // Fast path: just push due PENDING orders to their panels (no status sync).
    // Called every 5s so a rolled-back/retried order is resent almost instantly.
    if (url.searchParams.get("submitOnly") === "1") {
      const submitted = await submitPendingOrders();
      return ok({ ok: true, submitted });
    }

    // Refresh statuses (this also submits/retries pending orders first).
    // Default limit (500) clears large Processing backlogs each run.
    const status = await refreshOrderStatuses();

    // Sync balances periodically — only every ~10th minute to stay light.
    let balances: { panels: number; ok: number } | null = null;
    const minute = new Date().getMinutes();
    if (url.searchParams.get("balances") === "1" || minute % 10 === 0) {
      balances = await syncAllBalances();
    }

    return ok({ ok: true, status, balances });
  });
}

export const GET = run;
export const POST = run;
