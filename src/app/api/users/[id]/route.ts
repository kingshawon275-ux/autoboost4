import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, ok, fail, requireRole } from "@/lib/api";

const schema = z.object({
  approved: z.boolean().optional(),
  active: z.boolean().optional(),
  role: z.enum(["ADMIN", "MODERATOR", "USER"]).optional(),
  canDashboard: z.boolean().optional(),
  canAnalytics: z.boolean().optional(),
  canPanels: z.boolean().optional(),
});

export async function PATCH(req: Request, ctx: RouteContext<"/api/users/[id]">) {
  return handle(async () => {
    const admin = await requireRole(["ADMIN"]);
    const { id } = await ctx.params;
    if (id === admin.id) return fail("You cannot modify your own account here", 400);

    const data = schema.parse(await req.json());
    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(data.approved !== undefined && { approved: data.approved }),
        ...(data.active !== undefined && { active: data.active }),
        ...(data.role !== undefined && { role: data.role }),
        ...(data.canDashboard !== undefined && { canDashboard: data.canDashboard }),
        ...(data.canAnalytics !== undefined && { canAnalytics: data.canAnalytics }),
        ...(data.canPanels !== undefined && { canPanels: data.canPanels }),
      },
      select: {
        id: true,
        approved: true,
        active: true,
        role: true,
        canDashboard: true,
        canAnalytics: true,
        canPanels: true,
      },
    });

    if (data.approved === true) {
      await prisma.notification.create({
        data: {
          type: "INFO",
          title: "Account approved",
          message: "Your account has been approved. You can now log in.",
          userId: id,
        },
      });
    }

    return ok(user);
  });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/users/[id]">) {
  return handle(async () => {
    const admin = await requireRole(["ADMIN"]);
    const { id } = await ctx.params;
    if (id === admin.id) return fail("You cannot delete your own account", 400);
    await prisma.user.delete({ where: { id } });
    return ok({ success: true });
  });
}
