import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`ALTER TYPE "AlarmType" ADD VALUE IF NOT EXISTS 'METER_FAILURE';`);
  console.log("Successfully added METER_FAILURE to AlarmType enum in database!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
