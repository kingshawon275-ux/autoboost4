import { handle, ok, requireRole } from "@/lib/api";
import { syncServices, syncBalance } from "@/lib/smm/panel-service";

// Large catalogues (10k+ services) take a while to import — allow a long run.
export const maxDuration = 60;

export async function POST(req: Request, ctx: RouteContext<"/api/panels/[id]/sync">) {
  return handle(async () => {
    await requireRole(["ADMIN", "MODERATOR"]);
    const { id } = await ctx.params;
    const url = new URL(req.url);
    const what = url.searchParams.get("what") ?? "all";

    const balance = what === "services" ? null : await syncBalance(id);
    const services = what === "balance" ? null : await syncServices(id);

    return ok({
      balance: balance ? { ok: balance.ok, value: balance.data?.balance ?? null } : null,
      services: services
        ? {
            ok: services.ok,
            count: services.count,
            skipped: services.skipped ?? 0,
            received: services.received ?? services.count,
          }
        : null,
    });
  });
}
