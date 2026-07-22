import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const serial = `TEST-METER-${Math.floor(Math.random() * 10000)}`;
  console.log(`Adding new meter with serial: ${serial}`);

  const device = await prisma.device.create({
    data: {
      deviceSerialNo: serial,
      // No customerId means it should be "NEW"
    },
  });

  console.log("Device created successfully:");
  console.log(JSON.stringify(device, null, 2));
  
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
