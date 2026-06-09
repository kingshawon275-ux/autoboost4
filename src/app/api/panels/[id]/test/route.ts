import { handle, ok, requireUser } from "@/lib/api";
import { testPanel } from "@/lib/smm/panel-service";

export async function POST(_req: Request, ctx: RouteContext<"/api/panels/[id]/test">) {
  return handle(async () => {
    await requireUser();
    const { id } = await ctx.params;
    const res = await testPanel(id);
    return ok({
      ok: res.ok,
      responseMs: res.durationMs,
      balance: res.data?.balance ?? null,
      currency: res.data?.currency ?? null,
      error: res.error ?? null,
    });
  });
}
