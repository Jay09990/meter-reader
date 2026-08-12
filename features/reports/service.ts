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

export interface ReportReading {
  id: string;
  deviceId: string;
  deviceSerialNo: string;
  meterSerialNo: string | null;
  readingDate: string;
  correctedVolumeVb: number | null;
  uncorrectedVolumeVm: number | null;
  gasPressure: number | null;
  gasTemperature: number | null;
  batteryLevel: number | null;
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
  customerId: string;
  startDate: string;
  endDate: string;
}

export async function getCustomerReport({
  customerId,
  startDate,
  endDate,
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

  const customer = await db.customer.findUnique({ where: { id: customerId } });
  if (!customer) {
    throw new ReportNotFoundError("Customer not found");
  }

  const readings = await db.reading.findMany({
    where: {
      device: { customerId },
      readingDate: { gte: start, lte: endOfDay },
    },
    include: {
      device: {
        select: { id: true, deviceSerialNo: true, meterSerialNo: true },
      },
    },
    orderBy: [{ device: { deviceSerialNo: "asc" } }, { readingDate: "asc" }],
  });

  const formattedReadings: ReportReading[] = readings.map((r) => ({
    id: r.id,
    deviceId: r.device.id,
    deviceSerialNo: r.device.deviceSerialNo,
    meterSerialNo: r.device.meterSerialNo,
    readingDate: r.readingDate.toISOString(),
    correctedVolumeVb: r.correctedVolumeVb,
    uncorrectedVolumeVm: r.uncorrectedVolumeVm,
    gasPressure: r.gasPressure,
    gasTemperature: r.gasTemperature,
    batteryLevel: r.batteryLevel,
  }));

  const meters = groupReadingsByMeter(formattedReadings);

  return {
    customerId,
    customerName: customer.name,
    startDate,
    endDate,
    readings: formattedReadings,
    meters,
  };
}

// Groups the flat reading list into one bucket per device/meter.
// A meter with no readings in the selected range simply won't appear here —
// that's what keeps the Excel export from producing empty/misleading sheets.
function groupReadingsByMeter(readings: ReportReading[]): MeterReportGroup[] {
  const meterMap = new Map<string, MeterReportGroup>();

  for (const reading of readings) {
    let group = meterMap.get(reading.deviceId);
    if (!group) {
      group = {
        deviceId: reading.deviceId,
        deviceSerialNo: reading.deviceSerialNo,
        meterSerialNo: reading.meterSerialNo,
        readings: [],
      };
      meterMap.set(reading.deviceId, group);
    }
    group.readings.push(reading);
  }

  return Array.from(meterMap.values());
}