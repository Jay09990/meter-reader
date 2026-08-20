import { db } from "@/lib/db";
import {
  getMonthStart,
  getMonthEnd,
  getQuarterEnd,
  toIsoDate,
} from "@/lib/financial-calendar";
import { getDeviceBoundaryReading } from "@/lib/boundary-readings";
import {
  RangeSelectorType,
  ReportNotFoundError,
  ReportValidationError,
} from "./service";

export interface MeterRangeSummary {
  deviceId: string;
  deviceSerialNo: string;
  meterSerialNo: string | null;
  customerName: string | null;
  startDate: string; // ISO date of the range's start boundary
  startValue: number | null;
  endDate: string; // ISO date of the range's end boundary (clamped to today if the selected period hasn't finished yet)
  endValue: number | null;
  consumption: number | null; // endValue - startValue
  suspect: boolean; // true if consumption came out negative (meter reset)
}

export interface CustomerRangeReport {
  customerId: string;
  customerName: string;
  rangeType: RangeSelectorType;
  rangeLabel: string; // e.g. "August 2026", "Q2 FY 25-26 (Jul-Sep 2025)", "FY 25-26"
  startDate: string;
  endDate: string;
  meters: MeterRangeSummary[];
}

export interface GetCustomerRangeReportParams {
  customerId: string | string[];
  rangeType: RangeSelectorType;
  month?: string; // "YYYY-MM"
  fyStartYear?: number;
  quarter?: 1 | 2 | 3 | 4;
}

export async function getCustomerRangeReport(
  params: GetCustomerRangeReportParams,
): Promise<CustomerRangeReport> {
  const { customerId, rangeType, month, fyStartYear, quarter } = params;

  if (!customerId) {
    throw new ReportValidationError("Customer ID is required");
  }
  if (!rangeType) {
    throw new ReportValidationError("Range type is required");
  }

  let start: Date;
  let rawEnd: Date;
  let rangeLabel: string;

  const today = new Date();
  const todayIso = toIsoDate(today);

  if (rangeType === "monthly") {
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      throw new ReportValidationError("Valid month (YYYY-MM) is required for monthly range");
    }
    const [yStr, mStr] = month.split("-");
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10) - 1; // 0-based
    const d = new Date(Date.UTC(y, m, 1));
    start = getMonthStart(d);
    rawEnd = getMonthEnd(d);

    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    rangeLabel = `${monthNames[m]} ${y}`;
  } else if (rangeType === "quarterly") {
    if (!fyStartYear || isNaN(fyStartYear)) {
      throw new ReportValidationError("Financial year is required for quarterly range");
    }
    if (!quarter || ![1, 2, 3, 4].includes(quarter)) {
      throw new ReportValidationError("Quarter (1-4) is required for quarterly range");
    }

    const shortFY = `${String(fyStartYear).slice(2)}-${String(fyStartYear + 1).slice(2)}`;

    if (quarter === 1) {
      start = new Date(Date.UTC(fyStartYear, 3, 1)); // Apr 1
      rawEnd = getQuarterEnd(start);
      rangeLabel = `Q1 FY ${shortFY} (Apr-Jun ${fyStartYear})`;
    } else if (quarter === 2) {
      start = new Date(Date.UTC(fyStartYear, 6, 1)); // Jul 1
      rawEnd = getQuarterEnd(start);
      rangeLabel = `Q2 FY ${shortFY} (Jul-Sep ${fyStartYear})`;
    } else if (quarter === 3) {
      start = new Date(Date.UTC(fyStartYear, 9, 1)); // Oct 1
      rawEnd = getQuarterEnd(start);
      rangeLabel = `Q3 FY ${shortFY} (Oct-Dec ${fyStartYear})`;
    } else {
      start = new Date(Date.UTC(fyStartYear + 1, 0, 1)); // Jan 1 of next calendar year
      rawEnd = getQuarterEnd(start);
      rangeLabel = `Q4 FY ${shortFY} (Jan-Mar ${fyStartYear + 1})`;
    }
  } else if (rangeType === "yearly") {
    if (!fyStartYear || isNaN(fyStartYear)) {
      throw new ReportValidationError("Financial year is required for yearly range");
    }
    start = new Date(Date.UTC(fyStartYear, 3, 1)); // Apr 1
    rawEnd = new Date(Date.UTC(fyStartYear + 1, 2, 31)); // Mar 31
    const shortFY = `${String(fyStartYear).slice(2)}-${String(fyStartYear + 1).slice(2)}`;
    rangeLabel = `FY ${shortFY}`;
  } else {
    throw new ReportValidationError(`Unsupported range type: ${rangeType}`);
  }

  const startIso = toIsoDate(start);
  const rawEndIso = toIsoDate(rawEnd);
  // Clamp end date to today if period extends into the future
  const endIso = rawEndIso > todayIso ? todayIso : rawEndIso;

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
    include: {
      devices: {
        select: {
          id: true,
          deviceSerialNo: true,
          meterSerialNo: true,
        },
        orderBy: { deviceSerialNo: "asc" },
      },
    },
  });

  if (customers.length === 0) {
    throw new ReportNotFoundError("No customers found");
  }

  const customerName =
    customers.length === 1
      ? customers[0].name
      : `${customers.length} Customers`;

  const meters: MeterRangeSummary[] = [];

  for (const cust of customers) {
    for (const device of cust.devices) {
      const startValue = await getDeviceBoundaryReading(device.id, startIso);
      const endValue = await getDeviceBoundaryReading(device.id, endIso);

      let consumption: number | null = null;
      let suspect = false;

      if (startValue != null && endValue != null) {
        const delta = endValue - startValue;
        if (delta < 0) {
          consumption = null;
          suspect = true;
        } else {
          consumption = Number(delta.toFixed(3));
          suspect = false;
        }
      }

      meters.push({
        deviceId: device.id,
        deviceSerialNo: device.deviceSerialNo,
        meterSerialNo: device.meterSerialNo,
        customerName: cust.name,
        startDate: startIso,
        startValue,
        endDate: endIso,
        endValue,
        consumption,
        suspect,
      });
    }
  }

  // Sort meters by deviceSerialNo
  meters.sort((a, b) => a.deviceSerialNo.localeCompare(b.deviceSerialNo));

  return {
    customerId: customerIds.join(","),
    customerName,
    rangeType,
    rangeLabel,
    startDate: startIso,
    endDate: endIso,
    meters,
  };
}
