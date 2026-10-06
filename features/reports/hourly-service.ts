// Loads hourly consumption payloads for selected customers and flattens timestamped points into report rows.
import { db } from "@/lib/db";
import { normalizeHourlyConsumption } from "@/lib/hourly-consumption";
import { Prisma } from "@prisma/client";

export class HourlyReportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HourlyReportValidationError";
  }
}

export interface HourlyConsumptionReportRow {
  id: string;
  deviceId: string;
  customerId: string | null;
  deviceSerialNo: string;
  meterSerialNo: string | null;
  streamNo: number;
  customerName: string | null;
  customerCategory: string | null;
  gaName: string | null;
  timestamp: string;
  consumption: number;
  pressure: number | null;
  temperature: number | null;
}

export interface HourlyConsumptionReport {
  startDate: string;
  endDate: string;
  rows: HourlyConsumptionReportRow[];
}

interface GetHourlyConsumptionReportParams {
  customerId: string | string[];
  startDate: string;
  endDate: string;
  gaId?: string;
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseDateOnly(date: string): Date | null {
  if (!DATE_ONLY_PATTERN.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === date ? parsed : null;
}

function shiftUtcDate(date: Date, days: number): Date {
  const shifted = new Date(date);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted;
}

/** Builds one timestamped row per meter and hourly point in the requested calendar dates. */
export async function getHourlyConsumptionReport({
  customerId,
  startDate,
  endDate,
  gaId,
}: GetHourlyConsumptionReportParams): Promise<HourlyConsumptionReport> {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  if (!start || !end) {
    throw new HourlyReportValidationError("Start date and end date must use YYYY-MM-DD format.");
  }
  if (start > end) {
    throw new HourlyReportValidationError("Start date cannot be later than end date.");
  }

  const requestedCustomerIds = Array.isArray(customerId)
    ? customerId
    : customerId.split(",").map((id) => id.trim()).filter(Boolean);
  const customerWhere = {
    ...(gaId ? { gaId } : {}),
    ...(requestedCustomerIds.length === 1 && requestedCustomerIds[0] === "all"
      ? {}
      : { id: { in: requestedCustomerIds } }),
  };
  const customers = await db.customer.findMany({ where: customerWhere, select: { id: true } });
  const customerIds = customers.map((customer) => customer.id);
  if (customerIds.length === 0) {
    throw new HourlyReportValidationError("Select at least one valid customer.");
  }

  // Hourly payloads can be attached to the following day's reading, so include
  // adjacent reading dates and filter the points by their own timestamps below.
  const readings = await db.reading.findMany({
    where: {
      device: { customerId: { in: customerIds } },
      readingDate: {
        gte: shiftUtcDate(start, -1),
        lt: shiftUtcDate(end, 2),
      },
      hourlyConsumption: { not: Prisma.JsonNull },
    },
    select: {
      id: true,
      deviceId: true,
      readingDate: true,
      receivedAt: true,
      hourlyConsumption: true,
      gasPressure: true,
      gasTemperature: true,
      device: {
        select: {
          deviceSerialNo: true,
          meterSerialNo: true,
          category: true,
          customer: {
            select: {
              id: true,
              name: true,
              ga: { select: { name: true } },
            },
          },
        },
      },
    },
    orderBy: [{ device: { deviceSerialNo: "asc" } }, { receivedAt: "asc" }],
  });

  const startKey = startDate;
  const endKey = endDate;
  const rowsByDeviceAndTimestamp = new Map<string, HourlyConsumptionReportRow>();
  const receivedAtByKey = new Map<string, number>();

  for (const reading of readings) {
    for (const point of normalizeHourlyConsumption(reading.hourlyConsumption)) {
      const timestamp = point.timestamp;
      if (!timestamp || !/^\d{4}-\d{2}-\d{2}T/.test(timestamp)) continue;
      const timestampDate = timestamp.slice(0, 10);
      if (timestampDate < startKey || timestampDate > endKey || !Number.isFinite(Date.parse(timestamp))) continue;

      const key = `${reading.deviceId}:${timestamp}`;
      const receivedAt = reading.receivedAt.getTime();
      if ((receivedAtByKey.get(key) ?? -Infinity) > receivedAt) continue;

      rowsByDeviceAndTimestamp.set(key, {
        id: `${reading.id}:${timestamp}`,
        deviceId: reading.deviceId,
        customerId: reading.device.customer?.id ?? null,
        deviceSerialNo: reading.device.deviceSerialNo,
        meterSerialNo: reading.device.meterSerialNo,
        streamNo: 0,
        customerName: reading.device.customer?.name ?? null,
        customerCategory: reading.device.category,
        gaName: reading.device.customer?.ga?.name ?? null,
        timestamp,
        consumption: point.value,
        pressure: point.pressure ?? reading.gasPressure,
        temperature: point.temperature ?? reading.gasTemperature,
      });
      receivedAtByKey.set(key, receivedAt);
    }
  }

  const rows = Array.from(rowsByDeviceAndTimestamp.values()).sort(
    (left, right) => left.deviceSerialNo.localeCompare(right.deviceSerialNo)
      || left.timestamp.localeCompare(right.timestamp),
  );

  const metersByCustomer = new Map<string, Map<string, string>>();
  for (const row of rows) {
    const customerKey = row.customerId ?? row.customerName ?? "";
    const customerMeters = metersByCustomer.get(customerKey) ?? new Map<string, string>();
    customerMeters.set(row.deviceId, row.meterSerialNo || row.deviceSerialNo);
    metersByCustomer.set(customerKey, customerMeters);
  }

  const streamNumberByCustomerAndDevice = new Map<string, number>();
  for (const [customerKey, customerMeters] of metersByCustomer) {
    const sortedDeviceIds = Array.from(customerMeters.entries())
      .sort((left, right) => left[1].localeCompare(right[1]))
      .map(([deviceId]) => deviceId);
    sortedDeviceIds.forEach((deviceId, index) => {
      streamNumberByCustomerAndDevice.set(`${customerKey}:${deviceId}`, index + 1);
    });
  }

  for (const row of rows) {
    const customerKey = row.customerId ?? row.customerName ?? "";
    row.streamNo = streamNumberByCustomerAndDevice.get(`${customerKey}:${row.deviceId}`) ?? 0;
  }

  return { startDate, endDate, rows };
}
