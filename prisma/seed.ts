import { PrismaClient, CustomerCategory, AlarmType, AlarmSeverity } from "@prisma/client";

const prisma = new PrismaClient();

// ─────────────────────────────────────────────────────────────
// City / Geographical Area definitions (matches the 8 clusters
// used in the map view reference screenshots)
// ─────────────────────────────────────────────────────────────
const CITIES = {
  PUNE: { name: "Pune City GA", code: "PUNE-01", lat: 18.5204, lng: 73.8567 },
  MUMBAI: { name: "Mumbai Metro GA", code: "BOM-01", lat: 19.0760, lng: 72.8777 },
  DELHI: { name: "Delhi GA", code: "DEL-01", lat: 28.6139, lng: 77.2090 },
  AHMEDABAD: { name: "Ahmedabad GA", code: "AMD-01", lat: 23.0225, lng: 72.5714 },
  KOLKATA: { name: "Kolkata GA", code: "CCU-01", lat: 22.5726, lng: 88.3639 },
  HYDERABAD: { name: "Hyderabad GA", code: "HYD-01", lat: 17.3850, lng: 78.4867 },
  BENGALURU: { name: "Bengaluru GA", code: "BLR-01", lat: 12.9716, lng: 77.5946 },
  CHENNAI: { name: "Chennai GA", code: "MAA-01", lat: 13.0827, lng: 80.2707 },
} as const;

type CityKey = keyof typeof CITIES;
type DeviceStatusPlan = "ONLINE" | "WARNING" | "CRITICAL" | "OFFLINE" | "NEW";

interface DeviceSeed {
  serial: string;
  meterSerial: string | null;
  city: CityKey;
  latJitter: number;
  lngJitter: number;
  customerName: string | null;
  category: CustomerCategory | null;
  address: string;
  statusPlan: DeviceStatusPlan;
  baseVolume: number; // starting daily corrected volume
  baseFlow: number; // SCMH
  basePressure: number; // bar
  baseTemp: number; // celsius
  baseBattery: number; // %
  monthGrowth: number; // fractional growth applied per elapsed month
}

// 23 devices across 8 cities. Status mix per city is deliberately
// uneven (including a near-tie cluster in Delhi) to exercise the
// map's majority-color / tie-break logic.
const DEVICES: DeviceSeed[] = [
  // ── Delhi (3 provisioned + 1 unprovisioned = 4 markers) ──
  { serial: "DEV-2001", meterSerial: "MET-6001", city: "DELHI", latJitter: 0.35, lngJitter: -0.25,
    customerName: "Adani Energy Works", category: "INDUSTRIAL", address: "Plot 22, SIPCOT High Tech Park, Delhi",
    statusPlan: "ONLINE", baseVolume: 1650, baseFlow: 24, basePressure: 2.55, baseTemp: 16, baseBattery: 96, monthGrowth: 0.05 },
  { serial: "DEV-2002", meterSerial: "MET-6002", city: "DELHI", latJitter: -0.15, lngJitter: 0.05,
    customerName: "Delhi Public Utilities", category: "COMMERCIAL", address: "Connaught Place, Delhi",
    statusPlan: "WARNING", baseVolume: 1100, baseFlow: 17, basePressure: 2.4, baseTemp: 17, baseBattery: 78, monthGrowth: 0.04 },
  { serial: "DEV-2003", meterSerial: "MET-6003", city: "DELHI", latJitter: -0.5, lngJitter: -0.4,
    customerName: "Rohini Residency", category: "RESIDENTIAL", address: "Sector 9, Rohini, Delhi",
    statusPlan: "CRITICAL", baseVolume: 320, baseFlow: 4.2, basePressure: 2.05, baseTemp: 18, baseBattery: 61, monthGrowth: 0.02 },
  { serial: "DEV-2004", meterSerial: null, city: "DELHI", latJitter: 0.1, lngJitter: 0.3,
    customerName: null, category: null, address: "Newly installed — unassigned",
    statusPlan: "NEW", baseVolume: 0, baseFlow: 0, basePressure: 0, baseTemp: 0, baseBattery: 100, monthGrowth: 0 },

  // ── Ahmedabad (3) ──
  { serial: "DEV-2101", meterSerial: "MET-6101", city: "AHMEDABAD", latJitter: 0.2, lngJitter: -0.1,
    customerName: "Sabarmati Textiles", category: "INDUSTRIAL", address: "GIDC Estate, Naroda, Ahmedabad",
    statusPlan: "ONLINE", baseVolume: 1420, baseFlow: 21, basePressure: 2.48, baseTemp: 19, baseBattery: 91, monthGrowth: 0.06 },
  { serial: "DEV-2102", meterSerial: "MET-6102", city: "AHMEDABAD", latJitter: -0.3, lngJitter: 0.15,
    customerName: "Gujarat Bulk Gas Co", category: "BULK", address: "Vatva Industrial Estate, Ahmedabad",
    statusPlan: "WARNING", baseVolume: 2100, baseFlow: 30, basePressure: 2.7, baseTemp: 20, baseBattery: 83, monthGrowth: 0.03 },
  { serial: "DEV-2103", meterSerial: "MET-6103", city: "AHMEDABAD", latJitter: 0.05, lngJitter: 0.35,
    customerName: "Ahmedabad Mall Plaza", category: "COMMERCIAL", address: "SG Highway, Ahmedabad",
    statusPlan: "ONLINE", baseVolume: 980, baseFlow: 15, basePressure: 2.35, baseTemp: 19, baseBattery: 88, monthGrowth: 0.04 },

  // ── Kolkata (3) ──
  { serial: "DEV-2201", meterSerial: "MET-6201", city: "KOLKATA", latJitter: 0.1, lngJitter: -0.2,
    customerName: "Kolkata Steel Works", category: "INDUSTRIAL", address: "Howrah Industrial Belt, Kolkata",
    statusPlan: "ONLINE", baseVolume: 1750, baseFlow: 26, basePressure: 2.6, baseTemp: 22, baseBattery: 94, monthGrowth: 0.05 },
  { serial: "DEV-2202", meterSerial: "MET-6202", city: "KOLKATA", latJitter: -0.25, lngJitter: 0.1,
    customerName: "Howrah Residency", category: "RESIDENTIAL", address: "Shibpur, Howrah",
    statusPlan: "WARNING", baseVolume: 290, baseFlow: 3.8, basePressure: 2.1, baseTemp: 23, baseBattery: 71, monthGrowth: 0.02 },
  { serial: "DEV-2203", meterSerial: "MET-6203", city: "KOLKATA", latJitter: 0.3, lngJitter: 0.25,
    customerName: "Salt Lake Commercial Hub", category: "COMMERCIAL", address: "Sector V, Salt Lake, Kolkata",
    statusPlan: "ONLINE", baseVolume: 1050, baseFlow: 16, basePressure: 2.4, baseTemp: 22, baseBattery: 90, monthGrowth: 0.04 },

  // ── Mumbai (4) ──
  { serial: "DEV-2301", meterSerial: "MET-6301", city: "MUMBAI", latJitter: -0.15, lngJitter: 0.1,
    customerName: "Reliance Petrochemicals", category: "INDUSTRIAL", address: "Trombay Complex, Mumbai",
    statusPlan: "CRITICAL", baseVolume: 2400, baseFlow: 34, basePressure: 2.85, baseTemp: 21, baseBattery: 67, monthGrowth: 0.07 },
  { serial: "DEV-2302", meterSerial: "MET-6302", city: "MUMBAI", latJitter: 0.2, lngJitter: -0.2,
    customerName: "Central Mall", category: "COMMERCIAL", address: "Main Square, Mumbai",
    statusPlan: "ONLINE", baseVolume: 1150, baseFlow: 18, basePressure: 2.42, baseTemp: 20, baseBattery: 89, monthGrowth: 0.04 },
  { serial: "DEV-2303", meterSerial: "MET-6303", city: "MUMBAI", latJitter: -0.3, lngJitter: -0.05,
    customerName: "Andheri Residency", category: "RESIDENTIAL", address: "Andheri West, Mumbai",
    statusPlan: "ONLINE", baseVolume: 310, baseFlow: 4.0, basePressure: 2.15, baseTemp: 21, baseBattery: 93, monthGrowth: 0.02 },
  { serial: "DEV-2304", meterSerial: "MET-6304", city: "MUMBAI", latJitter: 0.05, lngJitter: 0.3,
    customerName: "Mumbai Bulk Distributors", category: "BULK", address: "JNPT Road, Navi Mumbai",
    statusPlan: "OFFLINE", baseVolume: 1900, baseFlow: 0, basePressure: 2.5, baseTemp: 21, baseBattery: 40, monthGrowth: 0.03 },

  // ── Hyderabad (2) ──
  { serial: "DEV-2401", meterSerial: "MET-6401", city: "HYDERABAD", latJitter: 0.15, lngJitter: 0.1,
    customerName: "Hyderabad Pharma Plant", category: "INDUSTRIAL", address: "Genome Valley, Hyderabad",
    statusPlan: "CRITICAL", baseVolume: 1980, baseFlow: 29, basePressure: 2.78, baseTemp: 24, baseBattery: 58, monthGrowth: 0.06 },
  { serial: "DEV-2402", meterSerial: "MET-6402", city: "HYDERABAD", latJitter: -0.2, lngJitter: -0.15,
    customerName: "Hitech City Commercial", category: "COMMERCIAL", address: "Hitech City, Hyderabad",
    statusPlan: "ONLINE", baseVolume: 1020, baseFlow: 15.5, basePressure: 2.38, baseTemp: 24, baseBattery: 87, monthGrowth: 0.04 },

  // ── Bengaluru (3) ──
  { serial: "DEV-2501", meterSerial: "MET-6501", city: "BENGALURU", latJitter: 0.1, lngJitter: -0.15,
    customerName: "Bengaluru Tech Park Energy", category: "INDUSTRIAL", address: "Electronic City Phase 1, Bengaluru",
    statusPlan: "ONLINE", baseVolume: 1580, baseFlow: 23, basePressure: 2.52, baseTemp: 18, baseBattery: 92, monthGrowth: 0.05 },
  { serial: "DEV-2502", meterSerial: "MET-6502", city: "BENGALURU", latJitter: -0.25, lngJitter: 0.2,
    customerName: "Whitefield Residency", category: "RESIDENTIAL", address: "Whitefield, Bengaluru",
    statusPlan: "CRITICAL", baseVolume: 300, baseFlow: 3.9, basePressure: 2.08, baseTemp: 19, baseBattery: 55, monthGrowth: 0.02 },
  { serial: "DEV-2503", meterSerial: "MET-6503", city: "BENGALURU", latJitter: 0.3, lngJitter: 0.05,
    customerName: "Electronic City Bulk Supply", category: "BULK", address: "Electronic City Phase 2, Bengaluru",
    statusPlan: "ONLINE", baseVolume: 2050, baseFlow: 28, basePressure: 2.65, baseTemp: 18, baseBattery: 90, monthGrowth: 0.04 },

  // ── Pune (2) ──
  { serial: "DEV-1001", meterSerial: "MET-5501", city: "PUNE", latJitter: 0, lngJitter: 0,
    customerName: "Acme Industrial Ltd", category: "INDUSTRIAL", address: "123 Factory Road, Pune",
    statusPlan: "ONLINE", baseVolume: 1500, baseFlow: 22, basePressure: 2.5, baseTemp: 15, baseBattery: 85, monthGrowth: 0.05 },
  { serial: "DEV-1002", meterSerial: "MET-5502", city: "PUNE", latJitter: -0.2, lngJitter: 0.25,
    customerName: "Pune Residency Complex", category: "RESIDENTIAL", address: "Kothrud, Pune",
    statusPlan: "OFFLINE", baseVolume: 340, baseFlow: 0, basePressure: 2.1, baseTemp: 15, baseBattery: 35, monthGrowth: 0.02 },

  // ── Chennai (2) ──
  { serial: "DEV-2601", meterSerial: "MET-6601", city: "CHENNAI", latJitter: 0.15, lngJitter: -0.1,
    customerName: "Chennai Auto Components", category: "INDUSTRIAL", address: "Ambattur Industrial Estate, Chennai",
    statusPlan: "WARNING", baseVolume: 1680, baseFlow: 25, basePressure: 2.58, baseTemp: 27, baseBattery: 74, monthGrowth: 0.05 },
  { serial: "DEV-2602", meterSerial: "MET-6602", city: "CHENNAI", latJitter: -0.1, lngJitter: 0.2,
    customerName: "T Nagar Commercial", category: "COMMERCIAL", address: "T Nagar, Chennai",
    statusPlan: "ONLINE", baseVolume: 1000, baseFlow: 15, basePressure: 2.36, baseTemp: 27, baseBattery: 91, monthGrowth: 0.04 },
];

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function utcDay(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function hoursAgo(h: number) {
  return new Date(Date.now() - h * 60 * 60 * 1000);
}

function daysAgo(d: number) {
  return new Date(Date.now() - d * 24 * 60 * 60 * 1000);
}

function genHourlyConsumption(dailyTotal: number) {
  // Rough bell-shaped daily usage curve across 24 hours
  const weights = [
    0.01, 0.01, 0.01, 0.01, 0.02, 0.03, 0.05, 0.07, 0.08, 0.07, 0.06, 0.05,
    0.05, 0.05, 0.06, 0.07, 0.08, 0.07, 0.06, 0.04, 0.03, 0.02, 0.01, 0.01,
  ];
  const total = weights.reduce((a, b) => a + b, 0);
  return weights.map((w, hour) => ({
    hour,
    value: Number(((dailyTotal * w) / total).toFixed(2)),
  }));
}

async function main() {
  console.log("Cleaning up existing data...");
  await prisma.alarm.deleteMany();
  await prisma.reading.deleteMany();
  await prisma.device.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.geographicalArea.deleteMany();
  await prisma.alarmSettings.deleteMany();

  console.log("Creating AlarmSettings...");
  await prisma.alarmSettings.create({
    data: { id: "singleton", gasDeviationWindowDays: 7, gasDeviationPercent: 20 },
  });

  console.log("Creating Geographical Areas...");
  const gaByCity: Record<CityKey, { id: string }> = {} as any;
  for (const key of Object.keys(CITIES) as CityKey[]) {
    const c = CITIES[key];
    gaByCity[key] = await prisma.geographicalArea.create({
      data: { name: c.name, code: c.code },
    });
  }

  console.log("Creating customers + devices...");
  const HISTORY_START = new Date("2026-01-01T00:00:00.000Z"); // ~7 months of history up to today
  const readingsData: any[] = [];
  const alarmsData: any[] = [];

  for (const d of DEVICES) {
    const city = CITIES[d.city];

    let customerId: string | null = null;
    if (d.customerName && d.category) {
      const customer = await prisma.customer.create({
        data: {
          name: d.customerName,
          category: d.category,
          address: d.address,
          gaId: gaByCity[d.city].id,
        },
      });
      customerId = customer.id;
    }

    // Determine lastSeenAt per status plan
    let lastSeenAt: Date | null;
    if (d.statusPlan === "NEW") {
      lastSeenAt = hoursAgo(rand(1, 6)); // pinging in, but unprovisioned
    } else if (d.statusPlan === "OFFLINE") {
      lastSeenAt = hoursAgo(rand(50, 96)); // firmly stale (>24h)
    } else {
      lastSeenAt = hoursAgo(rand(0.2, 6)); // recently reporting
    }

    const device = await prisma.device.create({
      data: {
        deviceSerialNo: d.serial,
        meterSerialNo: d.meterSerial,
        customerId,
        meterSize: customerId ? (d.category === "BULK" ? "150mm" : d.category === "INDUSTRIAL" ? "100mm" : "40mm") : null,
        firmwareVersion: customerId ? "v2.3.1" : null,
        hardwareVersion: customerId ? "HW-Rev-C" : null,
        deviceModel: customerId ? "Teltonika RUT956 + AMR Gas Meter" : "Teltonika RUT956",
        configurationVersion: customerId ? "cfg-2026-05" : null,
        latitude: city.lat + d.latJitter,
        longitude: city.lng + d.lngJitter,
        firstSeenAt: d.statusPlan === "NEW" ? hoursAgo(rand(1, 6)) : HISTORY_START,
        lastSeenAt,
      },
    });

    // NEW / unprovisioned devices have no reading/alarm history
    if (d.statusPlan === "NEW") continue;

    // Build daily readings from HISTORY_START through today (or up to
    // ~3 days before "now" for OFFLINE devices, to simulate the gap
    // that caused them to go stale).
    const endDate = d.statusPlan === "OFFLINE" ? daysAgo(3) : new Date();
    const totalDays = Math.floor((endDate.getTime() - HISTORY_START.getTime()) / (24 * 60 * 60 * 1000));

    let lastDailyVolume = d.baseVolume;
    for (let i = 0; i <= totalDays; i++) {
      const readingDate = utcDay(new Date(HISTORY_START.getTime() + i * 24 * 60 * 60 * 1000));
      const monthsElapsed = i / 30;
      const trend = 1 + d.monthGrowth * monthsElapsed;
      const variance = rand(-0.06, 0.06);
      const dailyVolume = Math.max(0, d.baseVolume * trend * (1 + variance));
      lastDailyVolume = dailyVolume;

      const isLastDay = i === totalDays;
      const batteryDrainDays = d.statusPlan === "OFFLINE" ? i : i; // simple linear drain either way
      const battery = Math.max(5, d.baseBattery - batteryDrainDays * 0.03);

      // Alarm-relevant devices show a pressure excursion; keep others nominal
      const pressureSpike =
        (d.statusPlan === "WARNING" || d.statusPlan === "CRITICAL") && isLastDay ? rand(0.35, 0.6) : 0;

      readingsData.push({
        deviceId: device.id,
        readingDate,
        correctedVolumeVb: Number(dailyVolume.toFixed(2)),
        uncorrectedVolumeVm: Number((dailyVolume * rand(0.97, 0.99)).toFixed(2)),
        gasPressure: Number((d.basePressure + pressureSpike + rand(-0.05, 0.05)).toFixed(2)),
        pressureMax: Number((d.basePressure + pressureSpike + 0.15).toFixed(2)),
        pressureMin: Number((d.basePressure - 0.1).toFixed(2)),
        gasTemperature: Number((d.baseTemp + rand(-1.5, 1.5)).toFixed(1)),
        temperatureMax: Number((d.baseTemp + 3).toFixed(1)),
        temperatureMin: Number((d.baseTemp - 2).toFixed(1)),
        compressibilityZ: Number(rand(0.97, 0.99).toFixed(4)),
        compressibilityFpv: Number(rand(1.01, 1.05).toFixed(4)),
        correctionFactorC: Number(rand(0.98, 1.02).toFixed(4)),
        gasDensity: Number(rand(0.68, 0.75).toFixed(3)),
        hourlyConsumption: isLastDay ? genHourlyConsumption(dailyVolume) : undefined,
        batteryLevel: Number(battery.toFixed(1)),
        currentFlowRate: d.statusPlan === "OFFLINE" ? null : Number((d.baseFlow * (1 + variance)).toFixed(2)),
        rawPayload: { source: "seed_script", deviceSerialNo: d.serial },
        receivedAt: readingDate,
      });
    }

    // ── Alarms ──
    if (d.statusPlan === "WARNING") {
      alarmsData.push({
        deviceId: device.id,
        type: AlarmType.GAS_OUT_OF_RANGE,
        severity: AlarmSeverity.WARNING,
        cause: "Gas pressure exceeded warning threshold vs 7-day average",
        gasValue: Number((d.basePressure + 0.45).toFixed(2)),
        averageValue: Number(d.basePressure.toFixed(2)),
        forDate: new Date(),
        status: "OPEN",
      });
    } else if (d.statusPlan === "CRITICAL") {
      alarmsData.push({
        deviceId: device.id,
        type: AlarmType.GAS_OUT_OF_RANGE,
        severity: AlarmSeverity.CRITICAL,
        cause: "Gas volume critically above daily average — possible leak signature",
        gasValue: Number((lastDailyVolume * 1.4).toFixed(2)),
        averageValue: Number(lastDailyVolume.toFixed(2)),
        forDate: new Date(),
        status: "OPEN",
      });
    } else if (d.statusPlan === "OFFLINE") {
      alarmsData.push({
        deviceId: device.id,
        type: AlarmType.MISSING_DATA,
        severity: AlarmSeverity.CRITICAL,
        cause: "No communication received for over 48 hours",
        forDate: new Date(),
        status: "OPEN",
      });
    }

    // Sprinkle a couple of older, resolved/acknowledged alarms on a
    // few otherwise-healthy devices so the Alarms page has history.
    if (d.statusPlan === "ONLINE" && Math.random() < 0.35) {
      alarmsData.push({
        deviceId: device.id,
        type: Math.random() < 0.5 ? AlarmType.GAS_OUT_OF_RANGE : AlarmType.MISSING_DATA,
        severity: AlarmSeverity.WARNING,
        cause: "Transient pressure fluctuation, self-resolved",
        gasValue: Number((d.basePressure + 0.2).toFixed(2)),
        averageValue: Number(d.basePressure.toFixed(2)),
        forDate: daysAgo(Math.floor(rand(10, 60))),
        status: "RESOLVED",
        acknowledged: true,
      });
    }
  }

  console.log(`Inserting ${readingsData.length} readings...`);
  // Chunk inserts to stay well under typical statement size limits
  const CHUNK = 500;
  for (let i = 0; i < readingsData.length; i += CHUNK) {
    await prisma.reading.createMany({ data: readingsData.slice(i, i + CHUNK) });
  }

  console.log(`Inserting ${alarmsData.length} alarms...`);
  await prisma.alarm.createMany({ data: alarmsData });

  console.log("Seeding finished.");
  console.log(`Devices: ${DEVICES.length} | Readings: ${readingsData.length} | Alarms: ${alarmsData.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });