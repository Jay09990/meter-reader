import { db } from "@/lib/db";

export class ReportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReportValidationError";
  }
}

export class ReportNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReportNotFoundError";
  }
}

export type ReportMode = "dateRange" | "rangeSelection";
export type RangeSelectorType = "monthly" | "quarterly" | "yearly";

export const FREQUENCY_OPTIONS = [
  { value: "1m", label: "1 minute", ms: 60_000 },
  { value: "5m", label: "5 minutes", ms: 5 * 60_000 },
  { value: "15m", label: "15 minutes", ms: 15 * 60_000 },
  { value: "30m", label: "30 minutes", ms: 30 * 60_000 },
  { value: "1h", label: "1 hour", ms: 60 * 60_000 },
  { value: "6h", label: "6 hours", ms: 6 * 60 * 60_000 },
  { value: "12h", label: "12 hours", ms: 12 * 60 * 60_000 },
  { value: "1d", label: "1 day", ms: 24 * 60 * 60_000 },
  { value: "15d", label: "15 days", ms: 15 * 24 * 60 * 60_000 },
  { value: "1mo", label: "1 month", ms: 30 * 24 * 60 * 60_000 },
] as const;
export type DataFrequency = (typeof FREQUENCY_OPTIONS)[number]["value"];

export interface ReportReading {
  id: string;
  deviceId: string;
  deviceSerialNo: string;
  meterSerialNo: string | null;
  customerName: string | null;
  customerCategory: string | null;
  gaName: string | null;
  readingDate: string;
  receivedAt: string;
  gasPressure: number | null;
  gasTemperature: number | null;
  correctionFactor: number | null;
  currentFlowRate: number | null;
  correctedVolumeVb: number | null;
  uncorrectedVolumeVm: number | null;
  prevDayUncorrected: number | null;
  prevDayCorrected: number | null;
  prevDayUncorrectedTotalizer: number | null;
  prevDayCorrectedTotalizer: number | null;
  batteryLevel: number | null;
  alarms: string | null;
  // Legacy aliases
  consumption: number | null;
  uncorrectedConsumption: number | null;
}

// One entry per physical meter (device) belonging to the customer.
// Used to build a separate Excel worksheet per meter on export.
export interface MeterReportGroup {
  deviceId: string;
  deviceSerialNo: string;
  meterSerialNo: string | null;
  readings: ReportReading[];
}

export interface CustomerReport {
  customerId: string;
  customerName: string;
  startDate: string;
  endDate: string;
  readings: ReportReading[];
  meters: MeterReportGroup[];
}

export interface GetCustomerReportParams {
  customerId: string | string[];
  startDate: string;
  endDate: string;
  frequency?: DataFrequency;
}

function resampleByFrequency<T extends { receivedAt: string; readingDate: string }>(
  readings: T[],
  frequency: DataFrequency,
  frequencyMs: number,
): T[] {
  if (frequency === "1d") {
    // Keep one reading per distinct calendar day (chronologically earliest reading of the day)
    const dayMap = new Map<string, T>();
    for (const r of readings) {
      const dayKey = r.readingDate.split("T")[0] || r.receivedAt.split("T")[0];
      if (!dayMap.has(dayKey)) {
        dayMap.set(dayKey, r);
      }
    }
    return Array.from(dayMap.values());
  }

  if (frequency === "1mo") {
    const monthMap = new Map<string, T>();
    for (const r of readings) {
      const monthKey = (r.readingDate || r.receivedAt).slice(0, 7);
      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, r);
      }
    }
    return Array.from(monthMap.values());
  }

  // For time-based intervals (1m, 5m, 15m, 30m, 1h, 6h, 12h, 15d)
  const kept: T[] = [];
  let lastKeptTime = -Infinity;
  for (const r of readings) {
    const t = new Date(r.receivedAt).getTime();
    if (t - lastKeptTime >= frequencyMs - 30_000) {
      kept.push(r);
      lastKeptTime = t;
    }
  }
  return kept;
}

/**
 * Computes consumption for report table rows:
 * - Previous day totalizers & deltas carried over directly in memory
 * - If prior reading exists in DB before start date, first row carries over prior reading
 * - If no prior reading in DB, first row shows null (-)
 */
async function computeConsumption(
  rawReadings: Omit<ReportReading, "prevDayCorrected" | "prevDayUncorrected" | "prevDayCorrectedTotalizer" | "prevDayUncorrectedTotalizer" | "consumption" | "uncorrectedConsumption">[],
): Promise<ReportReading[]> {
  if (rawReadings.length === 0) return [];

  const first = rawReadings[0];
  let firstPrevVolumeVb: number | null = null;
  let firstPrevVolumeVm: number | null = null;

  if (first.correctedVolumeVb != null || first.uncorrectedVolumeVm != null) {
    const prevReading = await db.reading.findFirst({
      where: {
        deviceId: first.deviceId,
        readingDate: { lt: new Date(first.readingDate) },
      },
      orderBy: [{ readingDate: "desc" }, { receivedAt: "desc" }],
      select: { correctedVolumeVb: true, uncorrectedVolumeVm: true },
    });
    firstPrevVolumeVb = prevReading?.correctedVolumeVb ?? null;
    firstPrevVolumeVm = prevReading?.uncorrectedVolumeVm ?? null;
  }

  return rawReadings.map((r, i) => {
    const prevVb = i === 0 ? firstPrevVolumeVb : rawReadings[i - 1].correctedVolumeVb;
    const prevVm = i === 0 ? firstPrevVolumeVm : rawReadings[i - 1].uncorrectedVolumeVm;

    let prevDayCorrected: number | null = null;
    if (r.correctedVolumeVb != null && prevVb != null) {
      const deltaVb = r.correctedVolumeVb - prevVb;
      prevDayCorrected = deltaVb < 0 ? null : Number(deltaVb.toFixed(3));
    }

    let prevDayUncorrected: number | null = null;
    if (r.uncorrectedVolumeVm != null && prevVm != null) {
      const deltaVm = r.uncorrectedVolumeVm - prevVm;
      prevDayUncorrected = deltaVm < 0 ? null : Number(deltaVm.toFixed(3));
    }

    const correctionFactor = (r.correctedVolumeVb != null && r.uncorrectedVolumeVm != null && r.uncorrectedVolumeVm > 0)
      ? Number((r.correctedVolumeVb / r.uncorrectedVolumeVm).toFixed(4))
      : null;

    return {
      ...r,
      correctionFactor,
      prevDayUncorrected,
      prevDayCorrected,
      prevDayUncorrectedTotalizer: prevVm,
      prevDayCorrectedTotalizer: prevVb,
      consumption: prevDayCorrected,
      uncorrectedConsumption: prevDayUncorrected,
    };
  });
}

export async function getCustomerReport({
  customerId,
  startDate,
  endDate,
  frequency = "1d",
}: GetCustomerReportParams): Promise<CustomerReport> {
  if (!customerId) {
    throw new ReportValidationError("Customer ID is required");
  }
  if (!startDate || !endDate) {
    throw new ReportValidationError("Start date and end date are required");
  }

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new ReportValidationError("Invalid date format");
  }
  if (start > end) {
    throw new ReportValidationError("Start date cannot be later than end date");
  }

  // Make endDate inclusive of the entire day
  const endOfDay = new Date(end);
  endOfDay.setHours(23, 59, 59, 999);

  let customerIds: string[];
  const rawId = Array.isArray(customerId) ? customerId : [customerId];

  if (rawId.length === 1 && (rawId[0] === "all" || rawId[0] === "")) {
    const allCusts = await db.customer.findMany({ select: { id: true } });
    customerIds = allCusts.map((c) => c.id);
  } else {
    customerIds = Array.isArray(customerId)
      ? customerId
      : customerId.split(",").filter((id) => id.trim() !== "");
  }

  if (customerIds.length === 0) {
    throw new ReportValidationError("At least one Customer ID is required");
  }

  const customers = await db.customer.findMany({
    where: { id: { in: customerIds } },
    include: { ga: { select: { name: true } } },
  });
  if (customers.length === 0) {
    throw new ReportNotFoundError("No customers found");
  }

  const customerName =
    customers.length === 1
      ? customers[0].name
      : `${customers.length} Customers`;

  const freqOption =
    FREQUENCY_OPTIONS.find((f) => f.value === frequency) ??
    FREQUENCY_OPTIONS.find((f) => f.value === "1d")!;
  const frequencyMs = freqOption.ms;

  const readings = await db.reading.findMany({
    where: {
      device: { customerId: { in: customerIds } },
      readingDate: { gte: start, lte: endOfDay },
    },
    include: {
      device: {
        select: {
          id: true,
          deviceSerialNo: true,
          meterSerialNo: true,
          alarms: {
            where: { status: "OPEN" },
            take: 1,
            select: { cause: true, type: true },
          },
          customer: {
            select: {
              name: true,
              category: true,
              ga: { select: { name: true } },
            },
          },
        },
      },
    },
    orderBy: [{ device: { deviceSerialNo: "asc" } }, { receivedAt: "asc" }],
  });

  type RawReading = Omit<ReportReading, "prevDayCorrected" | "prevDayUncorrected" | "prevDayCorrectedTotalizer" | "prevDayUncorrectedTotalizer" | "consumption" | "uncorrectedConsumption">;

  // Group raw readings per meter
  const meterMap = new Map<string,
    {
      deviceId: string;
      deviceSerialNo: string;
      meterSerialNo: string | null;
      readings: RawReading[];
    }
  >();

  for (const r of readings) {
    let group = meterMap.get(r.device.id);
    if (!group) {
      group = {
        deviceId: r.device.id,
        deviceSerialNo: r.device.deviceSerialNo,
        meterSerialNo: r.device.meterSerialNo,
        readings: [],
      };
      meterMap.set(r.device.id, group);
    }

    // const openAlarm = r.device.alarms[0];
    // const alarmText = openAlarm ? openAlarm.cause || openAlarm.type : "NORMAL";

    group.readings.push({
      id: r.id,
      deviceId: r.device.id,
      deviceSerialNo: r.device.deviceSerialNo,
      meterSerialNo: r.device.meterSerialNo,
      customerName: r.device.customer?.name || null,
      customerCategory: r.device.customer?.category || null,
      gaName: r.device.customer?.ga?.name || null,
      readingDate: r.readingDate.toISOString(),
      receivedAt: r.receivedAt.toISOString(),
      gasPressure: r.gasPressure,
      gasTemperature: r.gasTemperature,
      correctionFactor: null,
      currentFlowRate: r.currentFlowRate,
      correctedVolumeVb: r.correctedVolumeVb,
      uncorrectedVolumeVm: r.uncorrectedVolumeVm,
      batteryLevel: r.batteryLevel,
      alarms: "---",
    });
  }

  const processedMeters: MeterReportGroup[] = [];
  const allProcessedReadings: ReportReading[] = [];

  for (const group of meterMap.values()) {
    // 1. Resample first by the selected frequency (e.g. 1 distinct row per calendar day)
    const resampledRaw = resampleByFrequency(group.readings, frequency, frequencyMs);
    // 2. Compute consumption deltas between consecutive table rows
    const withCons = await computeConsumption(resampledRaw);

    processedMeters.push({
      deviceId: group.deviceId,
      deviceSerialNo: group.deviceSerialNo,
      meterSerialNo: group.meterSerialNo,
      readings: withCons,
    });

    allProcessedReadings.push(...withCons);
  }

  // Re-sort flattened array matching ordering convention (by deviceSerialNo then readingDate)
  allProcessedReadings.sort((a, b) => {
    if (a.deviceSerialNo !== b.deviceSerialNo) {
      return a.deviceSerialNo.localeCompare(b.deviceSerialNo);
    }
    return new Date(a.readingDate).getTime() - new Date(b.readingDate).getTime();
  });

  return {
    customerId: customerIds.join(","),
    customerName,
    startDate,
    endDate,
    readings: allProcessedReadings,
    meters: processedMeters,
  };
}