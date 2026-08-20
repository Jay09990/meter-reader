import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const targetSerials = ["Elgas-000123", "EVC-000123"];
  for (const serial of targetSerials) {
    console.log(`\n=== DETAILS FOR ${serial} ===`);
    const device = await prisma.device.findUnique({
      where: { deviceSerialNo: serial },
      include: {
        readings: {
          orderBy: { readingDate: 'desc' },
        },
        alarms: true,
      }
    });
    if (device) {
      console.log(`Device: ${device.id}, batteryLowerLimit: ${device.batteryLowerLimit}`);
      console.log(`Readings Count: ${device.readings.length}`);
      device.readings.slice(0, 5).forEach(r => {
        console.log(`- Date: ${r.readingDate.toISOString()}, Battery: ${r.batteryLevel}, Received: ${r.receivedAt.toISOString()}`);
      });
      console.log(`Alarms Count: ${device.alarms.length}`);
      device.alarms.forEach(a => {
        console.log(`- Type: ${a.type}, Status: ${a.status}, Cause: ${a.cause}`);
      });
    } else {
      console.log("Device not found.");
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
