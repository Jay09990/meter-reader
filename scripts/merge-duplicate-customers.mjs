// One-off maintenance script: finds Customer rows that share the same
// name (case-insensitive) and merges them — reassigns every device from
// the duplicate(s) onto a single "keeper" record, then deletes the
// duplicate(s). Safe to re-run; a second run will find nothing to merge.
//
// Usage:
//   node scripts/merge-duplicate-customers.mjs            # dry run (default, no writes)
//   node scripts/merge-duplicate-customers.mjs --apply    # actually perform the merge

import { readFileSync, existsSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

// Plain `node` doesn't auto-load .env the way `next dev`/`next build` do,
// so load it ourselves (no extra dependency needed) before touching Prisma.
loadEnvFile(".env");
loadEnvFile(".env.local");

function loadEnvFile(path) {
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) process.env[key] = value;
  }
}

const prisma = new PrismaClient();
const isApply = process.argv.includes("--apply");

async function main() {
  const customers = await prisma.customer.findMany({
    include: { devices: { select: { id: true, deviceSerialNo: true } } },
  });

  const groups = new Map();
  for (const customer of customers) {
    const key = customer.name.trim().toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(customer);
  }

  const duplicateGroups = [...groups.values()].filter((group) => group.length > 1);

  if (duplicateGroups.length === 0) {
    console.log("No duplicate customer names found. Nothing to do.");
    return;
  }

  for (const group of duplicateGroups) {
    // Keep whichever record already has the most devices attached;
    // ties broken by whichever record was created first.
    group.sort(
      (a, b) => b.devices.length - a.devices.length || a.createdAt - b.createdAt,
    );
    const [keeper, ...duplicates] = group;

    console.log(`\n"${keeper.name}" — keeping ${keeper.id} (${keeper.devices.length} device(s))`);

    for (const dup of duplicates) {
      console.log(
        `  merging ${dup.id} (${dup.devices.length} device(s): ${dup.devices
          .map((d) => d.deviceSerialNo)
          .join(", ") || "none"}) -> ${keeper.id}`,
      );

      if (isApply) {
        await prisma.device.updateMany({
          where: { customerId: dup.id },
          data: { customerId: keeper.id },
        });
        await prisma.customer.delete({ where: { id: dup.id } });
      }
    }
  }

  console.log(
    isApply
      ? "\nDone — duplicate customers merged."
      : "\nDry run complete — no changes made. Re-run with --apply to perform the merge.",
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
