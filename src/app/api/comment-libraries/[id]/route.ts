import { prisma } from "@/lib/prisma";
import { handle, ok, fail, requireUser, requireRole } from "@/lib/api";
import { commentLibrarySchema } from "@/lib/validators";

// Full library (including all comments) — for the admin editor.
export async function GET(_req: Request, ctx: RouteContext<"/api/comment-libraries/[id]">) {
  return handle(async () => {
    await requireUser();
    const { id } = await ctx.params;
    const lib = await prisma.commentLibrary.findUnique({ where: { id } });
    if (!lib) return fail("Not found", 404);
    return ok(lib);
  });
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/comment-libraries/[id]">) {
  return handle(async () => {
    await requireRole(["ADMIN", "MODERATOR"]);
    const { id } = await ctx.params;
    const data = commentLibrarySchema.parse(await req.json());
    const lib = await prisma.commentLibrary.update({
      where: { id },
      data: { name: data.name, comments: data.comments, enabled: data.enabled },
    });
    return ok({ id: lib.id, name: lib.name, enabled: lib.enabled, count: lib.comments.length });
  });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/comment-libraries/[id]">) {
  return handle(async () => {
    await requireRole(["ADMIN", "MODERATOR"]);
    const { id } = await ctx.params;
    await prisma.commentLibrary.delete({ where: { id } }).catch(() => {});
    return ok({ success: true });
  });
}
