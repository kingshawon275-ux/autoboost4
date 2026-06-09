import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/**
 * Production seed: creates ONLY the admin user so you can log in.
 * No demo panels, services, mappings or notifications — this is a real,
 * fully working platform. Add your real panels from the dashboard.
 */
async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL || "admin@autoboost.dev").toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || "Admin123!";
  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: "ADMIN", active: true, approved: true },
    create: { email, name: "Admin", passwordHash, role: "ADMIN", approved: true },
  });

  console.log(`✔ Admin user ready: ${email}`);
  console.log("\n🎉 Seed complete. Log in and add your real SMM panels from the dashboard.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
