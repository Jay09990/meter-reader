import { describe, it, expect } from "vitest";
import type { MeterReportGroup, ReportReading } from "@/features/reports";
import type ExcelJS from "exceljs";
import {
  sanitizeSheetName,
  buildCustomerReportWorkbook,
  AMR_REPORT_HEADERS,
  AMR_REPORT_UNITS,
} from "./report-excel";

function makeReading(overrides: Partial<ReportReading> = {}): ReportReading {
  return {
    id: "reading-1",
    deviceId: "device-1",
    deviceSerialNo: "DEV-001",
    meterSerialNo: "METER-001",
    customerName: null,
    customerCategory: null,
    gaName: null,
    readingDate: "2026-08-01T00:00:00.000Z",
    receivedAt: "2026-08-01T01:00:00.000Z",
    gasPressure: 1.2,
    gasTemperature: 20,
    correctionFactor: 1.05,
    currentFlowRate: 12.5,
    correctedVolumeVb: 100,
    uncorrectedVolumeVm: 95,
    prevDayUncorrected: 10,
    prevDayCorrected: 10.5,
    prevDayUncorrectedTotalizer: 85,
    prevDayCorrectedTotalizer: 89.5,
    batteryLevel: 80,
    alarms: null,
    consumption: null,
    uncorrectedConsumption: null,
    ...overrides,
  };
}

function sheetNames(workbook: ExcelJS.Workbook): string[] {
  return workbook.worksheets.map((ws) => ws.name);
}

function sheetRows(
  workbook: ExcelJS.Workbook,
  sheetName: string,
): (string | number)[][] {
  const worksheet = workbook.getWorksheet(sheetName);
  if (!worksheet) return [];
  const rows: (string | number)[][] = [];
  worksheet.eachRow((row) => {
    const values = row.values as (string | number | undefined)[];
    rows.push(values.slice(1) as (string | number)[]);
  });
  return rows;
}

function makeMeterGroup(overrides: Partial<MeterReportGroup> = {}): MeterReportGroup {
  return {
    deviceId: "device-1",
    deviceSerialNo: "DEV-001",
    meterSerialNo: "METER-001",
    readings: [makeReading()],
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// sanitizeSheetName
// ──────────────────────────────────────────────────────────────────────────

describe("sanitizeSheetName", () => {
  it("removes characters Excel disallows in sheet names", () => {
    const used = new Set<string>();
    expect(sanitizeSheetName("Meter/001:Main*", "Meter-1", used)).toBe(
      "Meter_001_Main_",
    );
  });

  it("truncates to 31 characters", () => {
    const used = new Set<string>();
    const name = sanitizeSheetName("A".repeat(50), "Meter-1", used);
    expect(name.length).toBeLessThanOrEqual(31);
  });

  it("falls back to the provided name when the input is empty", () => {
    const used = new Set<string>();
    expect(sanitizeSheetName("", "Meter-1", used)).toBe("Meter-1");
  });

  it("de-duplicates names that collide after sanitization", () => {
    const used = new Set<string>();
    const first = sanitizeSheetName("Meter:001", "Meter-1", used);
    const second = sanitizeSheetName("Meter*001", "Meter-2", used);
    expect(first).not.toBe(second);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// buildCustomerReportWorkbook — dateRange mode (per-customer sheets)
// ──────────────────────────────────────────────────────────────────────────

describe("buildCustomerReportWorkbook — dateRange mode", () => {
  it("creates one worksheet per customer with AMR headers and units", () => {
    const meters: MeterReportGroup[] = [
      makeMeterGroup({
        deviceId: "device-1",
        customerNameOverride: "REDEEM CHURCH",
        readings: [makeReading({ customerName: "REDEEM CHURCH", id: "r1" })],
      }),
      makeMeterGroup({
        deviceId: "device-2",
        deviceSerialNo: "DEV-002",
        meterSerialNo: "METER-002",
        readings: [makeReading({ id: "r2", deviceId: "device-2", customerName: "ANOTHER CLIENT" })],
      }),
    ];

    const workbook = buildCustomerReportWorkbook(meters, "dateRange");

    expect(sheetNames(workbook)).toEqual([
      "REDEEM CHURCH",
      "ANOTHER CLIENT",
    ]);

    const rows1 = sheetRows(workbook, "REDEEM CHURCH");
    expect(rows1[0]).toEqual(AMR_REPORT_HEADERS);
    expect(rows1[1]).toEqual(AMR_REPORT_UNITS);
    expect(rows1).toHaveLength(3);

    const rows2 = sheetRows(workbook, "ANOTHER CLIENT");
    expect(rows2[0]).toEqual(AMR_REPORT_HEADERS);
    expect(rows2[1]).toEqual(AMR_REPORT_UNITS);
    expect(rows2).toHaveLength(3);
  });

  it("maps reading fields to the AMR row layout per customer sheet", () => {
    const meters: MeterReportGroup[] = [
      makeMeterGroup({
        readings: [
          makeReading({
            customerName: "REDEEM CHURCH",
            customerCategory: "PNG",
            gaName: "Chennai GA",
          }),
        ],
      }),
    ];

    const workbook = buildCustomerReportWorkbook(meters, "dateRange");
    const rows = sheetRows(workbook, "REDEEM CHURCH");
    const dataRow = rows[2];

    expect(dataRow[0]).toBe(1); // SR.NO
    expect(dataRow[1]).toBe("REDEEM CHURCH"); // NAME OF INDUSTRY
    expect(dataRow[2]).toBe("PNG"); // CUSTOMER TYPE
    expect(dataRow[3]).toBe("IBAFO"); // SOURCE/SEGMENT
    expect(dataRow[4]).toBe("METER-001"); // STREAM NO
    expect(dataRow[5]).toBe(1.2); // PRESSURE
    expect(dataRow[6]).toBe(20); // TEMPERATURE
    expect(dataRow[7]).toBe(1.05); // CORRECTION FACTOR
    expect(dataRow[8]).toBe(12.5); // CURRENT FLOWRATE (CORRECTED)
    expect(dataRow[9]).toBe(100); // CORRECTED VOLUME TOTALIZER
    expect(dataRow[10]).toBe(95); // UNCORRECTED VOLUME TOTALIZER
    expect(dataRow[11]).toBe(10); // PREVIOUS DAY UNCORRECTED
    expect(dataRow[12]).toBe(10.5); // PREVIOUS DAY CORRECTED
    expect(dataRow[13]).toBe(85); // PREVIOUS DAY UNCORRECTED TOTALIZER
    expect(dataRow[14]).toBe(89.5); // PREVIOUS DAY CORRECTED TOTAIZER
    expect(dataRow[15]).toBe(80); // EVC BATTERY VOLTAGE/BALANCE DAYS
    expect(dataRow[16]).toBe("NORMAL"); // ALARMS fallback
    expect(dataRow[17]).toBe("2026-08-01"); // DATE
  });

  it("restarts SR.NO at 1 for each customer sheet", () => {
    const meters: MeterReportGroup[] = [
      makeMeterGroup({
        deviceId: "d1",
        deviceSerialNo: "DEV-A1",
        meterSerialNo: "M-A1",
        readings: [
          makeReading({ id: "a1", deviceId: "d1", customerName: "CUSTOMER A" }),
          makeReading({
            id: "a2",
            deviceId: "d1",
            readingDate: "2026-08-02T00:00:00.000Z",
            customerName: "CUSTOMER A",
          }),
        ],
      }),
      {
        deviceId: "d2",
        deviceSerialNo: "DEV-B1",
        meterSerialNo: "M-B1",
        readings: [
          makeReading({ id: "b1", deviceId: "d2", customerName: "CUSTOMER B" }),
        ],
      },
    ];

    const workbook = buildCustomerReportWorkbook(meters, "dateRange");

    const rowsA = sheetRows(workbook, "CUSTOMER A");
    expect(rowsA.slice(2).map((r) => r[0])).toEqual([1, 2]);

    const rowsB = sheetRows(workbook, "CUSTOMER B");
    expect(rowsB.slice(2).map((r) => r[0])).toEqual([1]);
  });

  it("skips customers with no readings (no empty sheets)", () => {
    const meters: MeterReportGroup[] = [
      {
        deviceId: "d1",
        deviceSerialNo: "DEV-001",
        meterSerialNo: "METER-001",
        readings: [],
      },
      makeMeterGroup({
        deviceId: "d2",
        deviceSerialNo: "DEV-002",
        meterSerialNo: "METER-002",
        readings: [makeReading({ id: "r2", deviceId: "d2", customerName: "ACTIVE CUSTOMER" })],
      }),
    ];

    const workbook = buildCustomerReportWorkbook(meters, "dateRange");

    expect(sheetNames(workbook)).toEqual(["ACTIVE CUSTOMER"]);
    expect(sheetRows(workbook, "ACTIVE CUSTOMER")).toHaveLength(3);
  });

  it("returns an empty workbook when no customer has readings", () => {
    const meters: MeterReportGroup[] = [
      {
        deviceId: "d1",
        deviceSerialNo: "DEV-001",
        meterSerialNo: "METER-001",
        readings: [],
      },
    ];

    const workbook = buildCustomerReportWorkbook(meters, "dateRange");

    expect(sheetNames(workbook)).toEqual([]);
  });

  it("deduplicates sheet names when customer names collide after sanitization", () => {
    const meters: MeterReportGroup[] = [
      makeMeterGroup({
        deviceId: "d1",
        deviceSerialNo: "DEV-001",
        meterSerialNo: "M-001",
        readings: [makeReading({ id: "r1", deviceId: "d1", customerName: "Meter:001" })],
      }),
      makeMeterGroup({
        deviceId: "d2",
        deviceSerialNo: "DEV-002",
        meterSerialNo: "M-002",
        readings: [makeReading({ id: "r2", deviceId: "d2", customerName: "Meter*001" })],
      }),
    ];

    const workbook = buildCustomerReportWorkbook(meters, "dateRange");
    const names = sheetNames(workbook);

    expect(names).toHaveLength(2);
    expect(names[0]).not.toBe(names[1]);
  });

  it("uses sanitized fallback name when customer name is empty", () => {
    const meters: MeterReportGroup[] = [
      makeMeterGroup({
        deviceId: "d1",
        deviceSerialNo: "DEV-001",
        meterSerialNo: "M-001",
        readings: [makeReading({ id: "r1", deviceId: "d1", customerName: "" })],
      }),
    ];

    const workbook = buildCustomerReportWorkbook(meters, "dateRange");
    expect(sheetNames(workbook)).toContain("Customer");
  });

  it("handles multiple meters within a single customer", () => {
    const meters: MeterReportGroup[] = [
      makeMeterGroup({
        deviceId: "d1",
        deviceSerialNo: "DEV-001",
        meterSerialNo: "M-001",
        readings: [
          makeReading({
            id: "r1",
            deviceId: "d1",
            customerName: "MULTI METER CO",
            meterSerialNo: "M-001",
          }),
        ],
      }),
      makeMeterGroup({
        deviceId: "d2",
        deviceSerialNo: "DEV-002",
        meterSerialNo: "M-002",
        readings: [
          makeReading({
            id: "r2",
            deviceId: "d2",
            customerName: "MULTI METER CO",
            meterSerialNo: "M-002",
          }),
        ],
      }),
    ];

    const workbook = buildCustomerReportWorkbook(meters, "dateRange");
    const rows = sheetRows(workbook, "MULTI METER CO");

    expect(rows.slice(2).map((r) => r[0])).toEqual([1, 2]);
    expect(rows.slice(2).map((r) => r[4])).toEqual(["M-001", "M-002"]);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// buildCustomerReportWorkbook — rangeSelection mode (single sheet, summed)
// ──────────────────────────────────────────────────────────────────────────

describe("buildCustomerReportWorkbook — rangeSelection mode", () => {
  it("creates a single worksheet with one row per customer", () => {
    const meters: MeterReportGroup[] = [
      makeMeterGroup({
        deviceId: "d1",
        deviceSerialNo: "DEV-A1",
        meterSerialNo: "M-A1",
        readings: [makeReading({ id: "r1", deviceId: "d1", customerName: "CUSTOMER A" })],
      }),
      makeMeterGroup({
        deviceId: "d2",
        deviceSerialNo: "DEV-B1",
        meterSerialNo: "M-B1",
        readings: [makeReading({ id: "r2", deviceId: "d2", customerName: "CUSTOMER B" })],
      }),
    ];

    const workbook = buildCustomerReportWorkbook(meters, "rangeSelection");

    expect(sheetNames(workbook)).toEqual(["CUSTOMER A"]);
    const rows = sheetRows(workbook, "CUSTOMER A");
    expect(rows).toHaveLength(4); // headers + units + 2 data rows (2 customers)
    expect(rows[2][1]).toBe("CUSTOMER A");
    expect(rows[2][0]).toBe(1); // SR.NO = 1
  });

  it("sums numeric columns across all meters of the same customer", () => {
    const meters: MeterReportGroup[] = [
      makeMeterGroup({
        deviceId: "d1",
        deviceSerialNo: "DEV-A1",
        meterSerialNo: "M-A1",
        readings: [
          makeReading({
            id: "r1",
            deviceId: "d1",
            customerName: "SUMCUSTOMER",
            correctedVolumeVb: 100,
            uncorrectedVolumeVm: 90,
            prevDayCorrected: 10,
            prevDayUncorrected: 5,
            prevDayCorrectedTotalizer: 80,
            prevDayUncorrectedTotalizer: 70,
            gasPressure: 1.0,
            gasTemperature: 25,
            currentFlowRate: 10,
            batteryLevel: 80,
          }),
        ],
      }),
      makeMeterGroup({
        deviceId: "d2",
        deviceSerialNo: "DEV-A2",
        meterSerialNo: "M-A2",
        readings: [
          makeReading({
            id: "r2",
            deviceId: "d2",
            customerName: "SUMCUSTOMER",
            correctedVolumeVb: 200,
            uncorrectedVolumeVm: 180,
            prevDayCorrected: 20,
            prevDayUncorrected: 15,
            prevDayCorrectedTotalizer: 150,
            prevDayUncorrectedTotalizer: 130,
            gasPressure: 2.0,
            gasTemperature: 30,
            currentFlowRate: 20,
            batteryLevel: 90,
          }),
        ],
      }),
    ];

    const workbook = buildCustomerReportWorkbook(meters, "rangeSelection");
    const rows = sheetRows(workbook, "SUMCUSTOMER");
    const dataRow = rows[2];

    // SR.NO
    expect(dataRow[0]).toBe(1);
    // Customer name
    expect(dataRow[1]).toBe("SUMCUSTOMER");
    // Summed correctedVolumeVb: 100 + 200 = 300
    expect(dataRow[9]).toBe(300);
    // Summed uncorrectedVolumeVm: 90 + 180 = 270
    expect(dataRow[10]).toBe(270);
    // Summed prevDayCorrected: 10 + 20 = 30
    expect(dataRow[12]).toBe(30);
    // Summed prevDayUncorrected: 5 + 15 = 20
    expect(dataRow[11]).toBe(20);
    // Summed prevDayCorrectedTotalizer: 80 + 150 = 230
    expect(dataRow[14]).toBe(230);
    // Summed prevDayUncorrectedTotalizer: 70 + 130 = 200
    expect(dataRow[13]).toBe(200);
    // Average pressure: (1.0 + 2.0) / 2 = 1.5
    expect(dataRow[5]).toBe(1.5);
    // Average temperature: (25 + 30) / 2 = 27.5
    expect(dataRow[6]).toBe(27.5);
    // Average flow rate: (10 + 20) / 2 = 15
    expect(dataRow[8]).toBe(15);
    // Average battery: (80 + 90) / 2 = 85
    expect(dataRow[15]).toBe(85);
  });

  it("handles multiple rows for 3+ customers on the single sheet", () => {
    const meters: MeterReportGroup[] = [
      makeMeterGroup({
        deviceId: "d1",
        readings: [makeReading({ id: "r1", deviceId: "d1", customerName: "CUST C" })],
      }),
      makeMeterGroup({
        deviceId: "d2",
        readings: [makeReading({ id: "r2", deviceId: "d2", customerName: "CUST A" })],
      }),
      makeMeterGroup({
        deviceId: "d3",
        readings: [makeReading({ id: "r3", deviceId: "d3", customerName: "CUST B" })],
      }),
    ];

    const workbook = buildCustomerReportWorkbook(meters, "rangeSelection");
    expect(sheetNames(workbook)).toEqual(["CUST A"]);

    const rows = sheetRows(workbook, "CUST A");
    expect(rows).toHaveLength(5); // headers + units + 3 customer rows

    // Customers should be sorted alphabetically
    expect(rows[2][1]).toBe("CUST A");
    expect(rows[2][0]).toBe(1);
    expect(rows[3][1]).toBe("CUST B");
    expect(rows[3][0]).toBe(2);
    expect(rows[4][1]).toBe("CUST C");
    expect(rows[4][0]).toBe(3);
  });

  it("returns an empty workbook when no readings", () => {
    const meters: MeterReportGroup[] = [
      { deviceId: "d1", deviceSerialNo: "DEV-001", meterSerialNo: "M-001", readings: [] },
    ];

    const workbook = buildCustomerReportWorkbook(meters, "rangeSelection");
    expect(sheetNames(workbook)).toEqual([]);
  });

  it("defaults to dateRange behaviour when mode is omitted", () => {
    const meters: MeterReportGroup[] = [
      makeMeterGroup({
        deviceId: "d1",
        readings: [makeReading({ id: "r1", deviceId: "d1", customerName: "SINGLE" })],
      }),
    ];

    const workbook = buildCustomerReportWorkbook(meters);
    expect(sheetNames(workbook)).toEqual(["SINGLE"]);
    const rows = sheetRows(workbook, "SINGLE");
    expect(rows).toHaveLength(3);
  });
});
