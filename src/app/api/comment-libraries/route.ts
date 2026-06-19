import { prisma } from "@/lib/prisma";
import { handle, ok, requireUser, requireRole } from "@/lib/api";
import { commentLibrarySchema } from "@/lib/validators";

// List comment libraries. Any signed-in user can read them (to use in Auto
// Boost); only admins/mods create or edit (handled below + in [id]).
export async function GET() {
  return handle(async () => {
    await requireUser();
    const libs = await prisma.commentLibrary.findMany({
      orderBy: { name: "asc" },
    });
    // Return lightweight rows (count, not the full list) for the picker; the
    // full comments are only needed server-side when sending an order.
    return ok(
      libs.map((l) => ({
        id: l.id,
        name: l.name,
        enabled: l.enabled,
        count: l.comments.length,
      })),
    );
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    await requireRole(["ADMIN", "MODERATOR"]);
    const data = commentLibrarySchema.parse(await req.json());
    const lib = await prisma.commentLibrary.create({
      data: { name: data.name, comments: data.comments, enabled: data.enabled },
    });
    return ok({ id: lib.id, name: lib.name, enabled: lib.enabled, count: lib.comments.length }, { status: 201 });
  });
}
