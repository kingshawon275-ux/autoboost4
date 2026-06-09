import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Wipe ALL operational/demo data so the platform starts truly empty.
 * Preserves only ADMIN users (so you can still log in). Use --all to wipe users too.
 */
async function main() {
  const wipeUsers = process.argv.includes("--all");

  const counts = {
    orderLogs: await prisma.orderLog.deleteMany({}),
    orders: await prisma.order.deleteMany({}),
    transactions: await prisma.transaction.deleteMany({}),
    balanceSnapshots: await prisma.balanceSnapshot.deleteMany({}),
    serviceMappings: await prisma.serviceMapping.deleteMany({}),
    services: await prisma.service.deleteMany({}),
    apiLogs: await prisma.apiLog.deleteMany({}),
    notifications: await prisma.notification.deleteMany({}),
    activityLogs: await prisma.activityLog.deleteMany({}),
    panels: await prisma.panel.deleteMany({}),
  };

  for (const [k, v] of Object.entries(counts)) {
    console.log(`✔ Cleared ${v.count} ${k}`);
  }

  if (wipeUsers) {
    const loginHistory = await prisma.loginHistory.deleteMany({});
    const users = await prisma.user.deleteMany({});
    console.log(`✔ Cleared ${loginHistory.count} loginHistory`);
    console.log(`✔ Cleared ${users.count} users (including admins)`);
  } else {
    // Keep admins; remove login history for non-admins is unnecessary — leave history intact.
    const nonAdmin = await prisma.user.deleteMany({ where: { role: { not: "ADMIN" } } });
    console.log(`✔ Cleared ${nonAdmin.count} non-admin users (admins preserved)`);
  }

  console.log("\n🧹 Reset complete. The platform is now empty of demo/operational data.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
