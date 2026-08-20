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
  readingDate: string;
  receivedAt: string;
  correctedVolumeVb: number | null;
  uncorrectedVolumeVm: number | null;
  gasPressure: number | null;
  gasTemperature: number | null;
  batteryLevel: number | null;
  consumption: number | null;
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

function resampleByFrequency<T extends { receivedAt: string }>(
  readings: T[],
  frequencyMs: number,
): T[] {
  const kept: T[] = [];
  let lastKeptTime = -Infinity;
  for (const r of readings) {
    const t = new Date(r.receivedAt).getTime();
    if (t - lastKeptTime >= frequencyMs) {
      kept.push(r);
      lastKeptTime = t;
    }
  }
  return kept;
}

function withConsumption(
  readings: Omit<ReportReading, "consumption">[],
): ReportReading[] {
  return readings.map((r, i) => {
    if (i === 0) return { ...r, consumption: null }; // no prior point in range
    const prev = readings[i - 1];
    if (r.correctedVolumeVb == null || prev.correctedVolumeVb == null) {
      return { ...r, consumption: null };
    }
    const delta = r.correctedVolumeVb - prev.correctedVolumeVb;
    return { ...r, consumption: delta < 0 ? null : Number(delta.toFixed(3)) }; // negative = meter reset
  });
}

export async function getCustomerReport({
  customerId,
  startDate,
  endDate,
  frequency = "1h",
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
    FREQUENCY_OPTIONS.find((f) => f.value === "1h")!;
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
          customer: { select: { name: true } },
        },
      },
    },
    orderBy: [{ device: { deviceSerialNo: "asc" } }, { receivedAt: "asc" }],
  });

  type RawReading = Omit<ReportReading, "consumption">;

  // Group raw readings per meter
  const meterMap = new Map<
    string,
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
    group.readings.push({
      id: r.id,
      deviceId: r.device.id,
      deviceSerialNo: r.device.deviceSerialNo,
      meterSerialNo: r.device.meterSerialNo,
      customerName: r.device.customer?.name || null,
      readingDate: r.readingDate.toISOString(),
      receivedAt: r.receivedAt.toISOString(),
      correctedVolumeVb: r.correctedVolumeVb,
      uncorrectedVolumeVm: r.uncorrectedVolumeVm,
      gasPressure: r.gasPressure,
      gasTemperature: r.gasTemperature,
      batteryLevel: r.batteryLevel,
    });
  }

  // Apply resample + withConsumption independently per meter group
  const processedMeters: MeterReportGroup[] = [];
  const allProcessedReadings: ReportReading[] = [];

  for (const group of meterMap.values()) {
    const resampled = resampleByFrequency(group.readings, frequencyMs);
    const withCons = withConsumption(resampled);

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