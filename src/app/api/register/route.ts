import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, ok, fail } from "@/lib/api";

const schema = z.object({
  name: z.string().min(1, "Name is required").max(80),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export async function POST(req: Request) {
  return handle(async () => {
    const body = await req.json();
    const data = schema.parse(body);
    const email = data.email.toLowerCase().trim();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return fail("An account with this email already exists", 409);

    const passwordHash = await bcrypt.hash(data.password, 10);
    await prisma.user.create({
      data: {
        name: data.name,
        email,
        passwordHash,
        role: "USER",
        approved: false, // requires admin approval before login
        active: true,
      },
    });

    // Notify admins of the pending registration.
    const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
    if (admins.length) {
      await prisma.notification.createMany({
        data: admins.map((a) => ({
          type: "INFO" as const,
          title: "New registration",
          message: `${data.name} (${email}) is awaiting approval.`,
          userId: a.id,
        })),
      });
    }

    return ok({ success: true });
  });
}
