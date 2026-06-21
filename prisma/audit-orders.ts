import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Audit orders: how many actually reached the panel (have a providerOrderId)
 * vs. how many are "ghosts" (no providerOrderId — never charged at the panel,
 * but may show as spend on the site). Reports the real vs. apparent spend.
 *
 *   npm run audit-orders
 */
async function main() {
  const orders = await prisma.order.findMany({
    select: { id: true, providerOrderId: true, cost: true, status: true, createdAt: true },
  });

  const sent = orders.filter((o) => o.providerOrderId);
  const ghosts = orders.filter((o) => !o.providerOrderId);

  const realSpend = sent.reduce((s, o) => s + o.cost, 0);
  const ghostSpend = ghosts.reduce((s, o) => s + o.cost, 0);

  console.log(`\n=== Order audit ===`);
  console.log(`Total orders           : ${orders.length}`);
  console.log(`✅ Reached panel (real) : ${sent.length}   spend = $${realSpend.toFixed(4)}`);
  console.log(`👻 Never reached panel  : ${ghosts.length}   "spend" = $${ghostSpend.toFixed(4)} (NOT actually charged)`);
  console.log(`\nReal money spent       : $${realSpend.toFixed(4)}`);
  console.log(`(The site was over-reporting by $${ghostSpend.toFixed(4)} from ghost orders.)\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
