import { PrismaClient, CustomerCategory } from "@prisma/client";

const prisma = new PrismaClient();
const DAY_MS = 86_400_000;
const HISTORY_DAYS = 548; // Approximately 18 months, including today.

const fixtureMeters = [
  { serial: "DEMO-1801", meterSerial: "DM-1801", customer: "Demo Pune Foundry", category: CustomerCategory.INDUSTRIAL, ga: { name: "Pune City GA", code: "PUNE-01" }, address: "Chakan Industrial Estate, Pune", latitude: 18.6235, longitude: 73.7754, baseDailyUse: 1800, pressure: 2.45, temperature: 24, battery: 96 },
  { serial: "DEMO-1802", meterSerial: "DM-1802", customer: "Demo Mumbai Retail Park", category: CustomerCategory.COMMERCIAL, ga: { name: "Mumbai Metro GA", code: "BOM-01" }, address: "Powai, Mumbai", latitude: 19.1176, longitude: 72.906, baseDailyUse: 760, pressure: 2.3, temperature: 27, battery: 91 },
  { serial: "DEMO-1803", meterSerial: "DM-1803", customer: "Demo Ahmedabad Residency", category: CustomerCategory.RESIDENTIAL, ga: { name: "Ahmedabad GA", code: "AMD-01" }, address: "Bopal, Ahmedabad", latitude: 23.0396, longitude: 72.4647, baseDailyUse: 245, pressure: 2.1, temperature: 29, battery: 89 },
  { serial: "DEMO-1804", meterSerial: "DM-1804", customer: "Demo Hyderabad DRS Supply", category: CustomerCategory.DRS, ga: { name: "Hyderabad GA", code: "HYD-01" }, address: "Gachibowli, Hyderabad", latitude: 17.4401, longitude: 78.3489, baseDailyUse: 2350, pressure: 2.65, temperature: 28, battery: 94 },
  { serial: "DEMO-1805", meterSerial: "DM-1805", customer: "Demo Chennai Components", category: CustomerCategory.INDUSTRIAL, ga: { name: "Chennai GA", code: "MAA-01" }, address: "Oragadam, Chennai", latitude: 12.8957, longitude: 80.086, baseDailyUse: 1460, pressure: 2.55, temperature: 31, battery: 92 },
];

function utcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function hourlyConsumption(dailyUsage) {
  const weights = [1, 1, 1, 1, 2, 3, 5, 7, 8, 7, 6, 5, 5, 5, 6, 7, 8, 7, 6, 4, 3, 2, 1, 1];
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  return weights.map((weight, hour) => ({ hour, value: Number(((dailyUsage * weight) / totalWeight).toFixed(2)) }));
}

function buildReadings(deviceId, meter, startDate) {
  const readings = [];
  let cumulativeVolume = 75_000 + meter.baseDailyUse * 30;

  for (let day = 0; day < HISTORY_DAYS; day++) {
    const readingDate = new Date(startDate.getTime() + day * DAY_MS);
    const seasonalFactor = 1 + 0.12 * Math.sin((2 * Math.PI * day) / 365);
    const weeklyFactor = 1 + 0.04 * Math.sin((2 * Math.PI * day) / 7);
    const dailyUsage = meter.baseDailyUse * seasonalFactor * weeklyFactor;
    cumulativeVolume += dailyUsage;

    readings.push({
      deviceId,
      readingDate,
      correctedVolumeVb: Number(cumulativeVolume.toFixed(2)),
      uncorrectedVolumeVm: Number((cumulativeVolume * 0.985).toFixed(2)),
      gasPressure: Number((meter.pressure + 0.08 * Math.sin(day / 11)).toFixed(2)),
      pressureMax: Number((meter.pressure + 0.15).toFixed(2)),
      pressureMin: Number((meter.pressure - 0.12).toFixed(2)),
      gasTemperature: Number((meter.temperature + 3 * Math.sin((2 * Math.PI * day) / 365)).toFixed(1)),
      temperatureMax: meter.temperature + 4,
      temperatureMin: meter.temperature - 4,
      compressibilityZ: 0.985,
      compressibilityFpv: 1.02,
      correctionFactorC: 1,
      gasDensity: 0.72,
      hourlyConsumption: day === HISTORY_DAYS - 1 ? hourlyConsumption(dailyUsage) : undefined,
      batteryLevel: Number(Math.max(45, meter.battery - day * 0.025).toFixed(1)),
      currentFlowRate: Number((dailyUsage / 24).toFixed(2)),
      rawPayload: { source: "dummy_meter_fixture", deviceSerialNo: meter.serial },
      receivedAt: new Date(readingDate.getTime() + 12 * 60 * 60 * 1000),
    });
  }
  return readings;
}

async function createFixtureMeter(meter, startDate, endDate) {
  const geographicalArea = await prisma.geographicalArea.upsert({
    where: { code: meter.ga.code },
    update: { name: meter.ga.name },
    create: meter.ga,
  });
  const existingCustomer = await prisma.customer.findFirst({ where: { name: meter.customer } });
  const customer = existingCustomer
    ? await prisma.customer.update({ where: { id: existingCustomer.id }, data: { category: meter.category, address: meter.address, gaId: geographicalArea.id } })
    : await prisma.customer.create({ data: { name: meter.customer, category: meter.category, address: meter.address, gaId: geographicalArea.id } });

  const device = await prisma.device.upsert({
    where: { deviceSerialNo: meter.serial },
    update: { customerId: customer.id, meterSerialNo: meter.meterSerial, latitude: meter.latitude, longitude: meter.longitude, firstSeenAt: startDate, lastSeenAt: endDate },
    create: { deviceSerialNo: meter.serial, customerId: customer.id, meterSerialNo: meter.meterSerial, meterSize: "40mm", deviceModel: "Demo AMR Gas Meter", firmwareVersion: "demo-1.0", latitude: meter.latitude, longitude: meter.longitude, firstSeenAt: startDate, lastSeenAt: endDate },
  });

  await prisma.reading.deleteMany({ where: { deviceId: device.id } });
  const readings = buildReadings(device.id, meter, startDate);
  for (let index = 0; index < readings.length; index += 250) {
    await prisma.reading.createMany({ data: readings.slice(index, index + 250) });
  }
  return readings.length;
}

async function main() {
  const endDate = utcDay(new Date());
  const startDate = new Date(endDate.getTime() - (HISTORY_DAYS - 1) * DAY_MS);
  let readingCount = 0;
  for (const meter of fixtureMeters) readingCount += await createFixtureMeter(meter, startDate, endDate);
  console.log(`Created or refreshed ${fixtureMeters.length} demo meters with ${readingCount} readings from ${startDate.toISOString().slice(0, 10)} to ${endDate.toISOString().slice(0, 10)}.`);
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
