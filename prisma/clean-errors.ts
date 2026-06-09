import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Clear stale error messages from orders that are NOT failed (Completed,
// Processing, Partial, etc.) — fixes old "Retrying…" text showing under
// Completed orders.
async function main() {
  const res = await prisma.order.updateMany({
    where: { status: { not: "FAILED" }, errorMessage: { not: null } },
    data: { errorMessage: null },
  });
  console.log(`✔ Cleared error message from ${res.count} non-failed orders.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
