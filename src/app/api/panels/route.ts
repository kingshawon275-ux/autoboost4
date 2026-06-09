import { prisma } from "@/lib/prisma";
import { handle, ok, requireUser, requireRole } from "@/lib/api";
import { panelCreateSchema } from "@/lib/validators";
import { syncServices, syncBalance } from "@/lib/smm/panel-service";

export async function GET() {
  return handle(async () => {
    await requireUser();
    // Never send apiKey to the browser (any role).
    const panels = await prisma.panel.findMany({
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
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
    return ok(panels);
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    await requireRole(["ADMIN", "MODERATOR"]);
    const body = await req.json();
    const data = panelCreateSchema.parse(body);
    const panel = await prisma.panel.create({
      data: {
        name: data.name,
        apiUrl: data.apiUrl,
        apiKey: data.apiKey,
        currency: data.currency,
        notes: data.notes || null,
        priority: data.priority,
      },
    });

    // Auto-pull balance + the full service catalogue right away so the admin
    // never has to press "Sync". Fire-and-forget; errors are logged, not fatal.
    void (async () => {
      try {
        await syncBalance(panel.id);
        await syncServices(panel.id);
      } catch (err) {
        console.error("[panels] initial sync failed:", err instanceof Error ? err.message : err);
      }
    })();

    return ok(panel, { status: 201 });
  });
}
