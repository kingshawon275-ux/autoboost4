import { prisma } from "@/lib/prisma";
import { handle, ok, requireUser } from "@/lib/api";

export async function GET(req: Request, ctx: RouteContext<"/api/panels/[id]/services">) {
  return handle(async () => {
    await requireUser();
    const { id } = await ctx.params;
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim();

    // Match on either the provider service ID or the name.
    const where = {
      panelId: id,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { serviceId: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [services, total] = await Promise.all([
      prisma.service.findMany({
        where,
        orderBy: { name: "asc" },
        // High cap so the full catalogue is available; search narrows it further.
        take: 2000,
        select: {
          id: true,
          serviceId: true,
          name: true,
          rate: true,
          min: true,
          max: true,
          category: true,
        },
      }),
      prisma.service.count({ where: { panelId: id } }),
    ]);

    return ok({ services, total, returned: services.length });
  });
}
