import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Delete all FAILED orders (and their logs). Use after a fix when old Failed
 * rows are just noise — the provider already did/didn't process them and you
 * don't want to risk re-submitting (double charge/boost).
 *
 * Run:  npm run delete-failed
 */
async function main() {
  const failed = await prisma.order.findMany({
    where: { status: "FAILED" },
    select: { id: true },
  });
  if (!failed.length) {
    console.log("✔ No FAILED orders to delete.");
    return;
  }
  const ids = failed.map((o) => o.id);
  await prisma.orderLog.deleteMany({ where: { orderId: { in: ids } } });
  const res = await prisma.order.deleteMany({ where: { id: { in: ids } } });
  console.log(`✔ Deleted ${res.count} FAILED order(s) and their logs.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
