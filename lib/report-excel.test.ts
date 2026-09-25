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

describe("buildCustomerReportWorkbook", () => {
  it("creates one worksheet per customer with AMR headers and units", () => {
    const customers = [
      {
        customerName: "REDEEM CHURCH",
        meters: [
          {
            deviceId: "device-1",
            deviceSerialNo: "DEV-001",
            meterSerialNo: "METER-001",
            readings: [makeReading({ customerName: "REDEEM CHURCH" })],
          },
        ],
      },
      {
        customerName: "ANOTHER CLIENT",
        meters: [
          {
            deviceId: "device-2",
            deviceSerialNo: "DEV-002",
            meterSerialNo: "METER-002",
            readings: [makeReading({ id: "r2", deviceId: "device-2", customerName: "ANOTHER CLIENT" })],
          },
        ],
      },
    ];

    const workbook = buildCustomerReportWorkbook(customers);

    expect(sheetNames(workbook)).toEqual(["REDEEM CHURCH", "ANOTHER CLIENT"]);

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
    const customers = [
      {
        customerName: "REDEEM CHURCH",
        meters: [
          {
            deviceId: "device-1",
            deviceSerialNo: "DEV-001",
            meterSerialNo: "METER-001",
            readings: [
              makeReading({
                customerName: "REDEEM CHURCH",
                customerCategory: "PNG",
                gaName: "Chennai GA",
              }),
            ],
          },
        ],
      },
    ];

    const workbook = buildCustomerReportWorkbook(customers);
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
    const customers = [
      {
        customerName: "CUSTOMER A",
        meters: [
          {
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
          },
        ],
      },
      {
        customerName: "CUSTOMER B",
        meters: [
          {
            deviceId: "d2",
            deviceSerialNo: "DEV-B1",
            meterSerialNo: "M-B1",
            readings: [
              makeReading({ id: "b1", deviceId: "d2", customerName: "CUSTOMER B" }),
            ],
          },
        ],
      },
    ];

    const workbook = buildCustomerReportWorkbook(customers);

    const rowsA = sheetRows(workbook, "CUSTOMER A");
    expect(rowsA.slice(2).map((r) => r[0])).toEqual([1, 2]);

    const rowsB = sheetRows(workbook, "CUSTOMER B");
    expect(rowsB.slice(2).map((r) => r[0])).toEqual([1]);
  });

  it("skips customers with no readings (no empty sheets)", () => {
    const customers = [
      {
        customerName: "EMPTY CUSTOMER",
        meters: [
          {
            deviceId: "d1",
            deviceSerialNo: "DEV-001",
            meterSerialNo: "METER-001",
            readings: [],
          },
        ],
      },
      {
        customerName: "ACTIVE CUSTOMER",
        meters: [
          {
            deviceId: "d2",
            deviceSerialNo: "DEV-002",
            meterSerialNo: "METER-002",
            readings: [makeReading({ id: "r2", deviceId: "d2", customerName: "ACTIVE CUSTOMER" })],
          },
        ],
      },
    ];

    const workbook = buildCustomerReportWorkbook(customers);

    expect(sheetNames(workbook)).toEqual(["ACTIVE CUSTOMER"]);
    expect(sheetRows(workbook, "ACTIVE CUSTOMER")).toHaveLength(3);
  });

  it("returns an empty workbook when no customer has readings", () => {
    const customers = [
      {
        customerName: "EMPTY 1",
        meters: [
          {
            deviceId: "d1",
            deviceSerialNo: "DEV-001",
            meterSerialNo: "METER-001",
            readings: [],
          },
        ],
      },
    ];

    const workbook = buildCustomerReportWorkbook(customers);

    expect(sheetNames(workbook)).toEqual([]);
  });

  it("deduplicates sheet names when customer names collide after sanitization", () => {
    const customers = [
      {
        customerName: "Meter:001",
        meters: [
          {
            deviceId: "d1",
            deviceSerialNo: "DEV-001",
            meterSerialNo: "M-001",
            readings: [makeReading({ id: "r1", deviceId: "d1", customerName: "Meter:001" })],
          },
        ],
      },
      {
        customerName: "Meter*001",
        meters: [
          {
            deviceId: "d2",
            deviceSerialNo: "DEV-002",
            meterSerialNo: "M-002",
            readings: [makeReading({ id: "r2", deviceId: "d2", customerName: "Meter*001" })],
          },
        ],
      },
    ];

    const workbook = buildCustomerReportWorkbook(customers);
    const names = sheetNames(workbook);

    expect(names).toHaveLength(2);
    expect(names[0]).not.toBe(names[1]);
  });

  it("uses sanitized fallback name when customer name is empty", () => {
    const customers = [
      {
        customerName: "",
        meters: [
          {
            deviceId: "d1",
            deviceSerialNo: "DEV-001",
            meterSerialNo: "M-001",
            readings: [makeReading({ id: "r1", deviceId: "d1", customerName: "" })],
          },
        ],
      },
    ];

    const workbook = buildCustomerReportWorkbook(customers);
    expect(sheetNames(workbook)).toContain("Customer");
  });

  it("handles multiple meters within a single customer", () => {
    const customers = [
      {
        customerName: "MULTI METER CO",
        meters: [
          {
            deviceId: "d1",
            deviceSerialNo: "DEV-001",
            meterSerialNo: "M-001",
            readings: [makeReading({ id: "r1", deviceId: "d1", customerName: "MULTI METER CO", meterSerialNo: "M-001" })],
          },
          {
            deviceId: "d2",
            deviceSerialNo: "DEV-002",
            meterSerialNo: "M-002",
            readings: [makeReading({ id: "r2", deviceId: "d2", customerName: "MULTI METER CO", meterSerialNo: "M-002" })],
          },
        ],
      },
    ];

    const workbook = buildCustomerReportWorkbook(customers);
    const rows = sheetRows(workbook, "MULTI METER CO");

    expect(rows.slice(2).map((r) => r[0])).toEqual([1, 2]);
    expect(rows.slice(2).map((r) => r[4])).toEqual(["M-001", "M-002"]);
  });
});
