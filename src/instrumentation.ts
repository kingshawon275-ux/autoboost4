/**
 * Next.js calls register() once when the server process starts.
 *
 * The background scheduler is NOT started here. On the VPS we run the custom
 * server (server.js) which has its own built-in scheduler loop (pinging
 * /api/cron/sync). On serverless hosts there's no always-on process, so an
 * external cron drives /api/cron/sync instead. Either way, starting it here
 * would double-run it — so we leave this empty.
 */
export async function register() {
  // intentionally empty
}
