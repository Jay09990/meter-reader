import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Cleaning up existing data...");
  await prisma.alarm.deleteMany();
  await prisma.reading.deleteMany();
  await prisma.device.deleteMany();

  console.log("Creating dummy devices...");
  const device1 = await prisma.device.create({
    data: {
      deviceSerialNo: "DEV-1001",
      meterSerialNo: "MET-5501",
      siteLabel: "North Station",
      stationLabel: "Zone A",
      lastSeenAt: new Date(),
    },
  });

  const device2 = await prisma.device.create({
    data: {
      deviceSerialNo: "DEV-1002",
      meterSerialNo: "MET-5502",
      siteLabel: "South Station",
      stationLabel: "Zone B",
      lastSeenAt: new Date(Date.now() - 24 * 60 * 60 * 1000 * 2), // Stale device (2 days ago)
    },
  });

  console.log("Creating dummy readings (past 7 days)...");
  
  const readingsData = [];
  const now = new Date();
  
  // Generate 7 days of data for Device 1
  for (let i = 6; i >= 0; i--) {
    const readingDate = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    // Add some random variance to the readings to make the charts look realistic
    const variance = Math.random() * 50 - 25; 
    readingsData.push({
      deviceId: device1.id,
      readingDate: readingDate,
      correctedVolumeVb: 1500.0 + (6 - i) * 100 + variance,
      uncorrectedVolumeVm: 1480.0 + (6 - i) * 98 + variance,
      gasPressure: 2.5 + Math.random() * 0.2,
      gasTemperature: 15.0 + Math.random() * 2,
      rawPayload: { source: "dummy_seed" },
    });
  }

  // Generate 7 days of data for Device 2 (but stop 2 days ago to simulate stale status)
  for (let i = 8; i >= 2; i--) {
    const readingDate = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const variance = Math.random() * 30 - 15;
    readingsData.push({
      deviceId: device2.id,
      readingDate: readingDate,
      correctedVolumeVb: 1200.0 + (8 - i) * 80 + variance,
      uncorrectedVolumeVm: 1180.0 + (8 - i) * 78 + variance,
      gasPressure: 2.1 + Math.random() * 0.15,
      gasTemperature: 12.0 + Math.random() * 1.5,
      rawPayload: { source: "dummy_seed" },
    });
  }

  await prisma.reading.createMany({
    data: readingsData
  });

  console.log("Creating dummy alarms...");
  await prisma.alarm.create({
    data: {
      deviceId: device1.id,
      type: "GAS_OUT_OF_RANGE",
      cause: "Pressure exceeded maximum threshold",
      gasValue: 5.8,
      forDate: new Date(),
      status: "OPEN",
    },
  });

  await prisma.alarm.create({
    data: {
      deviceId: device2.id,
      type: "MISSING_DATA",
      cause: "No communication for 48 hours",
      forDate: new Date(),
      status: "OPEN",
    },
  });

  console.log("Seeding finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
