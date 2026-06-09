import { refreshOrderStatuses } from "@/lib/smm/order-service";
import { syncAllBalances, syncAllServices } from "@/lib/smm/panel-service";

/**
 * In-process background scheduler. Started once from instrumentation.ts when
 * the Node.js server boots. Keeps everything auto-updated so the admin never
 * has to press "Sync":
 *
 *   - order statuses   every 30s
 *   - panel balances   every 10m
 *   - service catalogue every 6h
 *
 * Each task guards against overlapping runs and never throws (a failed cycle
 * just logs and waits for the next tick).
 */

const INTERVALS = {
  status: 30 * 1000,
  balance: 10 * 60 * 1000,
  services: 6 * 60 * 60 * 1000,
} as const;

type TaskName = keyof typeof INTERVALS;

// Survive HMR/dev reloads by stashing state on globalThis.
const g = globalThis as unknown as {
  __autoboostScheduler?: {
    started: boolean;
    running: Record<TaskName, boolean>;
    timers: ReturnType<typeof setInterval>[];
  };
};

function makeTask(name: TaskName, fn: () => Promise<unknown>) {
  return async () => {
    const state = g.__autoboostScheduler!;
    if (state.running[name]) return; // skip if previous run still in flight
    state.running[name] = true;
    try {
      await fn();
    } catch (err) {
      console.error(`[scheduler:${name}] failed:`, err instanceof Error ? err.message : err);
    } finally {
      state.running[name] = false;
    }
  };
}

export function startScheduler() {
  if (g.__autoboostScheduler?.started) return;

  g.__autoboostScheduler = {
    started: true,
    running: { status: false, balance: false, services: false },
    timers: [],
  };
  const state = g.__autoboostScheduler;

  const statusTask = makeTask("status", () => refreshOrderStatuses(100));
  const balanceTask = makeTask("balance", () => syncAllBalances());
  const servicesTask = makeTask("services", () => syncAllServices());

  state.timers.push(setInterval(statusTask, INTERVALS.status));
  state.timers.push(setInterval(balanceTask, INTERVALS.balance));
  state.timers.push(setInterval(servicesTask, INTERVALS.services));

  // Don't keep the event loop alive solely for these timers.
  state.timers.forEach((t) => t.unref?.());

  // Kick off an initial balance sync shortly after boot (services on its own
  // 6h cadence; an explicit full sync also runs when a panel is added).
  setTimeout(() => void balanceTask(), 5_000);

  console.log("[scheduler] started — status 30s · balance 10m · services 6h");
}
