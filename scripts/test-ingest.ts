import { processIngestPayload } from "../features/ingest/service";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function test() {
  const payload = {
    deviceSerialNo: "EVC-000123",
    meterSerialNo: "MTR-98765",
    readingDate: "2026-08-20",
    volume: {
      correctedVb: 12345.67,
      uncorrectedVm: 12000.12
    },
    pressure: {
      value: 25.0,
      max: 28.0,
      min: 22.0,
    },
    temperature: {
      value: 45.0,
    },
    batteryLevel: 10.0, // Should trigger BATTERY_LOW since limit is 25
  };

  console.log("Processing payload directly...");
  try {
    const result = await processIngestPayload(payload);
    console.log("Result:", result);

    console.log("Checking alarms for device...");
    const alarms = await prisma.alarm.findMany({
      where: { device: { deviceSerialNo: "EVC-000123" } }
    });
    console.log("Alarms in DB:", JSON.stringify(alarms, null, 2));
  } catch (error) {
    console.error("Error during processing:", error);
  } finally {
    await prisma.$disconnect();
  }
}

test();
