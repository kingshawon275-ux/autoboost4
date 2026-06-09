import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Re-queue orders that were wrongly marked FAILED because of a TEMPORARY
 * provider message ("You have active order with this link", "already", etc.).
 * These actually succeed on retry, so we reset them to PENDING and let the
 * submit/retry queue pick them up again.
 *
 * Run:  npm run requeue-active
 */
async function main() {
  const failed = await prisma.order.findMany({
    where: { status: "FAILED", providerOrderId: null },
    select: { id: true, errorMessage: true },
  });

  // Temporary causes that should never have failed: the active-order race AND
  // DB write-conflict / deadlock errors (which fired before the success commit
  // was made resilient). Re-queueing lets them submit cleanly.
  const terms = [
    "active order", "already", "duplicate", "existing order", "in progress for this", "pending order",
    "write conflict", "writeconflict", "deadlock", "please retry", "transaction",
  ];
  const toRequeue = failed.filter((o) => {
    const e = (o.errorMessage ?? "").toLowerCase();
    return terms.some((t) => e.includes(t));
  });

  if (!toRequeue.length) {
    console.log("✔ No 'active order' FAILED orders to requeue.");
    return;
  }

  const res = await prisma.order.updateMany({
    where: { id: { in: toRequeue.map((o) => o.id) } },
    data: {
      status: "PENDING",
      errorMessage: null,
      submitAttempts: 0,
      nextRetryAt: new Date(),
    },
  });
  console.log(`✔ Re-queued ${res.count} order(s) that were wrongly Failed for 'active order'.`);
  console.log("  They will be re-submitted by the queue within ~20s (or on next sync).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
