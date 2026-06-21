import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Delete "ghost" orders — orders that never reached the panel (no
 * providerOrderId) and so were never actually charged, but show as spend on the
 * site. Only removes ones older than 10 minutes so anything still being
 * submitted right now is left alone.
 *
 *   npm run clean-ghosts
 */
async function main() {
  const cutoff = new Date(Date.now() - 10 * 60 * 1000);

  // Fetch candidates and filter in JS (Mongo's `providerOrderId: null` filter
  // misses docs where the field is absent).
  const candidates = await prisma.order.findMany({
    where: { createdAt: { lt: cutoff } },
    select: { id: true, providerOrderId: true, cost: true },
  });
  const ghosts = candidates.filter((o) => !o.providerOrderId);

  if (!ghosts.length) {
    console.log("✔ No ghost orders to clean.");
    return;
  }

  const ids = ghosts.map((o) => o.id);
  const ghostSpend = ghosts.reduce((s, o) => s + o.cost, 0);

  await prisma.orderLog.deleteMany({ where: { orderId: { in: ids } } }).catch(() => {});
  // Remove the bogus spend transactions tied to these orders too.
  await prisma.transaction.deleteMany({ where: { orderId: { in: ids } } }).catch(() => {});
  const res = await prisma.order.deleteMany({ where: { id: { in: ids } } });

  console.log(`✔ Deleted ${res.count} ghost order(s) that never reached a panel.`);
  console.log(`  Removed $${ghostSpend.toFixed(4)} of spend that was never actually charged.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
