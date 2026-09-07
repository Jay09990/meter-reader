import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const alarms = await prisma.alarm.findMany({
    where: {
      device: { deviceSerialNo: "DEMO-1805" },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: {
      device: {
        select: { deviceSerialNo: true, meterSerialNo: true },
      },
    },
  });

  console.log("Alarms for DEMO-1805:");
  console.log(JSON.stringify(alarms, null, 2));
}

main().finally(() => prisma.$disconnect());
