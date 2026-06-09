import { prisma } from "@/lib/prisma";
import { handle, ok, requireRole, requireUser } from "@/lib/api";
import { panelUpdateSchema } from "@/lib/validators";

export async function GET(_req: Request, ctx: RouteContext<"/api/panels/[id]">) {
  return handle(async () => {
    await requireUser();
    const { id } = await ctx.params;
    const panel = await prisma.panel.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        apiUrl: true,
        currency: true,
        notes: true,
        status: true,
        enabled: true,
        balance: true,
        successRate: true,
        responseMs: true,
        priority: true,
        lastSyncedAt: true,
        createdAt: true,
        _count: { select: { services: true, orders: true } },
      },
    });
    if (!panel) return ok({ error: "Not found" }, { status: 404 });
    return ok(panel);
  });
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/panels/[id]">) {
  return handle(async () => {
    await requireRole(["ADMIN", "MODERATOR"]);
    const { id } = await ctx.params;
    const body = await req.json();
    const data = panelUpdateSchema.parse(body);
    const panel = await prisma.panel.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.apiUrl !== undefined && { apiUrl: data.apiUrl }),
        ...(data.apiKey !== undefined && { apiKey: data.apiKey }),
        ...(data.currency !== undefined && { currency: data.currency }),
        ...(data.notes !== undefined && { notes: data.notes || null }),
        ...(data.priority !== undefined && { priority: data.priority }),
        ...(data.enabled !== undefined && { enabled: data.enabled }),
        ...(data.enabled === false && { status: "DISABLED" as const }),
      },
    });
    return ok(panel);
  });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/panels/[id]">) {
  return handle(async () => {
    await requireRole(["ADMIN"]);
    const { id } = await ctx.params;
    await prisma.panel.delete({ where: { id } });
    return ok({ success: true });
  });
}
