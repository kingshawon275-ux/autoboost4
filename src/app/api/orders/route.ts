import { prisma } from "@/lib/prisma";
import { handle, ok, requireUser } from "@/lib/api";
import { autoBoostSchema } from "@/lib/validators";
import { executeAutoBoost, planAutoBoost } from "@/lib/smm/order-service";

// Orders are saved instantly and submitted in the background, so this is quick.
// 60s works on both Vercel Free and Pro.
export const maxDuration = 60;

export async function GET(req: Request) {
  return handle(async () => {
    await requireUser();
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const take = Math.min(Number(url.searchParams.get("take")) || 100, 200);

    // NOTE: Provider status sync is NOT done here anymore. It runs on the cron
    // schedule (/api/cron/sync) so simply viewing Orders doesn't hammer the
    // server. This keeps resource usage low.
    const orders = await prisma.order.findMany({
      where: status ? { status: status as never } : undefined,
      include: { panel: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take,
    });
    return ok(orders);
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = await req.json();
    const input = autoBoostSchema.parse(body);

    // Dry run returns the distribution plan without creating orders.
    if (input.dryRun) {
      const plan = await planAutoBoost(input);
      return ok({ dryRun: true, plan });
    }

    const result = await executeAutoBoost(input, user.id);

    // Best-effort activity log.
    prisma.activityLog
      .create({
        data: {
          userId: user.id,
          action: "create_order",
          detail: `Auto Boost ${input.boosts.map((b) => b.boostType).join(", ")} on ${input.postUrl}`,
        },
      })
      .catch(() => {});

    return ok(
      {
        batchId: result.batchId,
        totalCost: result.plan.totalCost,
        warnings: result.plan.warnings,
        orders: result.orders,
      },
      { status: 201 },
    );
  });
}
