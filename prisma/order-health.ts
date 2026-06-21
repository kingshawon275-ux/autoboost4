import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Quick health report of the most recent order batch: how many orders were
 * created, how many reached the panel (have a providerOrderId), how many are
 * still pending, and how many failed (with the reason). Run after creating an
 * order to confirm everything went out.
 *
 *   npm run order-health
 */
async function main() {
  const latest = await prisma.order.findFirst({
    where: { batchId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { batchId: true },
  });
  if (!latest?.batchId) {
    console.log("No orders yet.");
    return;
  }

  const orders = await prisma.order.findMany({
    where: { batchId: latest.batchId },
    include: { panel: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });

  const sent = orders.filter((o) => o.providerOrderId).length;
  const pending = orders.filter((o) => !o.providerOrderId && o.status !== "FAILED").length;
  const failed = orders.filter((o) => o.status === "FAILED").length;

  console.log(`\nLatest batch: ${orders.length} order(s)`);
  console.log(`  ✅ sent to panel : ${sent}`);
  console.log(`  ⏳ still pending : ${pending}`);
  console.log(`  ❌ failed        : ${failed}\n`);

  for (const o of orders) {
    const tag = o.providerOrderId
      ? `✅ #${o.providerOrderId}`
      : o.status === "FAILED"
        ? `❌ ${o.errorMessage ?? "failed"}`
        : `⏳ ${o.status}`;
    console.log(`  ${o.panel?.name ?? "?"} / ${o.boostType} x${o.quantity}  →  ${tag}`);
  }
  console.log("");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
