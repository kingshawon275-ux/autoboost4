import { prisma } from "@/lib/prisma";
import { handle, ok, requireRole, requireUser } from "@/lib/api";
import { serviceMappingSchema } from "@/lib/validators";

export async function GET() {
  return handle(async () => {
    await requireUser();
    const mappings = await prisma.serviceMapping.findMany({
      include: {
        panel: { select: { id: true, name: true } },
        service: { select: { id: true, name: true, serviceId: true, rate: true } },
      },
      orderBy: [{ platform: "asc" }, { boostType: "asc" }],
    });
    return ok(mappings);
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    await requireRole(["ADMIN", "MODERATOR"]);
    const body = await req.json();
    const data = serviceMappingSchema.parse(body);

    // Ensure the service belongs to the panel.
    const service = await prisma.service.findUnique({ where: { id: data.serviceId } });
    if (!service || service.panelId !== data.panelId) {
      return ok({ error: "Service does not belong to the selected panel" }, { status: 422 });
    }

    const mapping = await prisma.serviceMapping.create({
      data: {
        boostType: data.boostType,
        platform: data.platform,
        panelId: data.panelId,
        serviceId: data.serviceId,
      },
      include: {
        panel: { select: { id: true, name: true } },
        service: { select: { id: true, name: true, serviceId: true, rate: true } },
      },
    });
    return ok(mapping, { status: 201 });
  });
}
