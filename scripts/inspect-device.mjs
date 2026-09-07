import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const device = await prisma.device.findFirst({
    where: {
      OR: [{ deviceSerialNo: "DEMO-1805" }, { meterSerialNo: "DEMO-1805" }, { meterSerialNo: "DM-1805" }],
    },
    include: {
      readings: {
        orderBy: [{ readingDate: "desc" }, { receivedAt: "desc" }],
        take: 3,
      },
    },
  });

  if (!device) {
    console.error("Device DEMO-1805 not found!");
    return;
  }

  console.log("Device:", {
    id: device.id,
    deviceSerialNo: device.deviceSerialNo,
    meterSerialNo: device.meterSerialNo,
  });

  console.log("Recent readings:");
  device.readings.forEach((r) => {
    console.log({
      readingDate: r.readingDate.toISOString(),
      correctedVolumeVb: r.correctedVolumeVb,
      uncorrectedVolumeVm: r.uncorrectedVolumeVm,
      receivedAt: r.receivedAt.toISOString(),
    });
  });
}

main().finally(() => prisma.$disconnect());
