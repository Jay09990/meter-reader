import { describe, it, expect } from "vitest";
import type { MeterReportGroup, ReportReading } from "@/features/reports";
import type ExcelJS from "exceljs";
import {
  sanitizeSheetName,
  buildCustomerReportWorkbook,
  AMR_REPORT_HEADERS,
  AMR_REPORT_UNITS,
} from "@/lib/report-excel";
import { groupReadingsByMeter } from "@/lib/report-excel-common";

// ── Fixtures ───────────────────────────────────────────────────────────────

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

function makeMeter(overrides: Partial<MeterReportGroup> = {}): MeterReportGroup {
  const meterSerialNo = overrides.meterSerialNo ?? "METER-001";
  const deviceSerialNo = overrides.deviceSerialNo ?? "DEV-001";
  const deviceId = overrides.deviceId ?? "d1";
  const readings: ReportReading[] = overrides.readings ?? [];
  // Propagate meter-level fields to readings that don't override them
  const propagatedReadings = readings.map((r) => ({
    ...r,
    deviceId: r.deviceId ?? deviceId,
    deviceSerialNo: r.deviceSerialNo ?? deviceSerialNo,
    meterSerialNo: r.meterSerialNo ?? meterSerialNo,
  }));
  return { deviceId, deviceSerialNo, meterSerialNo, readings: propagatedReadings, ...overrides };
}

// ── Sheet readers ──────────────────────────────────────────────────────────

type Row = (string | number)[];

function sheetNames(wb: ExcelJS.Workbook): string[] {
  return wb.worksheets.map((ws) => ws.name);
}

function sheetRows(wb: ExcelJS.Workbook, name: string): Row[] {
  const ws = wb.getWorksheet(name);
  if (!ws) return [];
  const rows: Row[] = [];
  ws.eachRow((row) => {
    rows.push((row.values as (string | number | undefined)[]).slice(1) as Row);
  });
  return rows;
}

/** Finds the table by its "SR.NO" header row, so tests don't depend on how tall the header block is. */
function readTable(wb: ExcelJS.Workbook, name: string) {
  const rows = sheetRows(wb, name);
  const headerIndex = rows.findIndex((row) => row[0] === "SR.NO");
  if (headerIndex === -1) throw new Error(`No table header row found in sheet "${name}"`);
  return {
    header: rows[headerIndex],
    units: rows[headerIndex + 1],
    data: rows.slice(headerIndex + 2),
  };
}

const DETAIL_LABELS = ["Customer Name", "Customer Type", "Source/Segment", "Meter Serial No(s)"];

/** Reads the label/value rows of the customer header block (label in column 1, value in column 3). */
function readCustomerDetails(wb: ExcelJS.Workbook, name: string): Record<string, string | number> {
  const details: Record<string, string | number> = {};
  for (const row of sheetRows(wb, name)) {
    if (DETAIL_LABELS.includes(String(row[0]))) details[String(row[0])] = row[2];
  }
  return details;
}

// Column indexes: dateRange sheets omit the three customer columns (they live in the header block).
const DATE_RANGE_COL = {
  SR_NO: 0, DATE_TIME: 1, METER_SN: 2, STREAM: 3,
  PRESSURE: 4, TEMP: 5, CF: 6, FLOW: 7, CORR_VB: 8, UNC_VM: 9,
  PREV_UNC: 10, PREV_CORR: 11, PREV_UNC_TOT: 12, PREV_CORR_TOT: 13,
  BATTERY: 14, ALARMS: 15, DATE: 16,
};

// rangeSelection sheet has the full 19-column layout.
const RANGE_COL = {
  SR_NO: 0, DATE_TIME: 1, NAME: 2, CATEGORY: 3, SOURCE: 4, METER_SN: 5, STREAM: 6,
  PRESSURE: 7, TEMP: 8, CF: 9, FLOW: 10, CORR_VB: 11, UNC_VM: 12,
  PREV_UNC: 13, PREV_CORR: 14, PREV_UNC_TOT: 15, PREV_CORR_TOT: 16,
  BATTERY: 17, ALARMS: 18, DATE: 19,
};

// ── Helpers under test ─────────────────────────────────────────────────────

describe("sanitizeSheetName", () => {
  it("removes Excel-invalid chars", () => {
    expect(sanitizeSheetName("Meter/001:Main*", "Fallback", new Set())).toBe("Meter_001_Main_");
  });
  it("truncates to 31 chars", () => {
    expect(sanitizeSheetName("A".repeat(50), "Fallback", new Set()).length).toBeLessThanOrEqual(31);
  });
  it("uses fallback when empty", () => {
    expect(sanitizeSheetName("", "Fallback", new Set())).toBe("Fallback");
  });
  it("deduplicates collisions", () => {
    const used = new Set<string>();
    const a = sanitizeSheetName("A:001", "Fallback", used);
    const b = sanitizeSheetName("A*001", "Fallback2", used);
    expect(a).not.toBe(b);
  });
});

describe("groupReadingsByMeter", () => {
  it("keeps readings of different devices in separate groups", () => {
    const groups = groupReadingsByMeter([
      makeReading({ id: "r1", deviceId: "d1" }),
      makeReading({ id: "r2", deviceId: "d2" }),
      makeReading({ id: "r3", deviceId: "d1" }),
    ]);
    expect(groups.map((g) => [g.deviceId, g.readings.length])).toEqual([
      ["d1", 2],
      ["d2", 1],
    ]);
  });
});

describe("AMR report column definitions", () => {
  it("exports 20 headers with a matching unit for each", () => {
    expect(AMR_REPORT_HEADERS).toHaveLength(20);
    expect(AMR_REPORT_UNITS).toHaveLength(AMR_REPORT_HEADERS.length);
  });
  it("puts DATE & TIME right after SR.NO", () => {
    expect(AMR_REPORT_HEADERS[0]).toBe("SR.NO");
    expect(AMR_REPORT_HEADERS[1]).toBe("DATE & TIME");
  });
});

// ── dateRange mode ─────────────────────────────────────────────────────────

describe("buildCustomerReportWorkbook — dateRange mode", () => {
  it("creates one sheet per customer, sorted alphabetically", () => {
    const meters = [
      makeMeter({ deviceId: "d1", readings: [makeReading({ id: "r1", deviceId: "d1", customerName: "REDEEM CHURCH" })] }),
      makeMeter({ deviceId: "d2", deviceSerialNo: "DEV-002", meterSerialNo: "M-002",
        readings: [makeReading({ id: "r2", deviceId: "d2", customerName: "ANOTHER CLIENT" })] }),
    ];
    const wb = buildCustomerReportWorkbook(meters, "dateRange");
    expect(sheetNames(wb)).toEqual(["ANOTHER CLIENT", "REDEEM CHURCH"]);
    expect(readTable(wb, "REDEEM CHURCH").data).toHaveLength(1);
    expect(readTable(wb, "ANOTHER CLIENT").data).toHaveLength(1);
  });

  it("puts a customer details header block above the table", () => {
    const meters = [
      makeMeter({ readings: [makeReading({ customerName: "REDEEM CHURCH", customerCategory: "COMMERCIAL" })] }),
    ];
    const wb = buildCustomerReportWorkbook(meters, "dateRange");
    const rows = sheetRows(wb, "REDEEM CHURCH");

    expect(rows[0][0]).toBe("CUSTOMER DETAILS");
    expect(readCustomerDetails(wb, "REDEEM CHURCH")).toEqual({
      "Customer Name": "REDEEM CHURCH",
      "Customer Type": "COMMERCIAL",
      "Source/Segment": "IBAFO",
      "Meter Serial No(s)": "METER-001",
    });

    // The header block sits above the table
    const bannerIndex = rows.findIndex((row) => row[0] === "CUSTOMER DETAILS");
    const tableIndex = rows.findIndex((row) => row[0] === "SR.NO");
    expect(bannerIndex).toBeLessThan(tableIndex);
  });

  it("lists every meter serial number of the customer in the header block", () => {
    const meters = [
      makeMeter({ deviceId: "d2", deviceSerialNo: "DEV-002", meterSerialNo: "M-002",
        readings: [makeReading({ id: "r2", deviceId: "d2", customerName: "MULTI", meterSerialNo: "M-002" })] }),
      makeMeter({ deviceId: "d1", deviceSerialNo: "DEV-001", meterSerialNo: "M-001",
        readings: [makeReading({ id: "r1", deviceId: "d1", customerName: "MULTI", meterSerialNo: "M-001" })] }),
    ];
    const wb = buildCustomerReportWorkbook(meters, "dateRange");
    expect(readCustomerDetails(wb, "MULTI")["Meter Serial No(s)"]).toBe("M-001, M-002");
  });

  it("omits the customer columns from the table (they are in the header block)", () => {
    const meters = [makeMeter({ readings: [makeReading({ customerName: "ACME" })] })];
    const wb = buildCustomerReportWorkbook(meters, "dateRange");
    const { header } = readTable(wb, "ACME");
    expect(header).toHaveLength(17);
    expect(header).not.toContain("NAME OF INDUSTRY");
    expect(header).not.toContain("CUSTOMER TYPE");
    expect(header).not.toContain("SOURCE/SEGMENT");
    expect(header).toContain("METER SERIAL NO");
    expect(header).toContain("DATE & TIME");
    expect(header[1]).toBe("DATE & TIME");
  });

  it("formats DATE & TIME as \"YYYY-MM-DD HH:mm\" from receivedAt", () => {
    const meters = [
      makeMeter({ readings: [makeReading({ customerName: "TIME CO", receivedAt: "2026-08-01T14:32:07.000Z" })] }),
    ];
    const [d] = readTable(buildCustomerReportWorkbook(meters, "dateRange"), "TIME CO").data;
    expect(d[DATE_RANGE_COL.DATE_TIME]).toBe("2026-08-01 14:32");
  });

  it("maps reading fields to the right columns", () => {
    const meters = [
      makeMeter({ readings: [makeReading({ customerName: "REDEEM CHURCH", customerCategory: "COMMERCIAL" })] }),
    ];
    const wb = buildCustomerReportWorkbook(meters, "dateRange");
    const [d] = readTable(wb, "REDEEM CHURCH").data;
    expect(d[DATE_RANGE_COL.SR_NO]).toBe(1);
    expect(d[DATE_RANGE_COL.DATE_TIME]).toBe("2026-08-01 01:00");
    expect(d[DATE_RANGE_COL.METER_SN]).toBe("METER-001");
    expect(d[DATE_RANGE_COL.STREAM]).toBe(1);
    expect(d[DATE_RANGE_COL.PRESSURE]).toBe(1.2);
    expect(d[DATE_RANGE_COL.TEMP]).toBe(20);
    expect(d[DATE_RANGE_COL.CF]).toBe(1.05);
    expect(d[DATE_RANGE_COL.FLOW]).toBe(12.5);
    expect(d[DATE_RANGE_COL.CORR_VB]).toBe(100);
    expect(d[DATE_RANGE_COL.UNC_VM]).toBe(95);
    expect(d[DATE_RANGE_COL.PREV_UNC]).toBe(10);
    expect(d[DATE_RANGE_COL.PREV_CORR]).toBe(10.5);
    expect(d[DATE_RANGE_COL.PREV_UNC_TOT]).toBe(85);
    expect(d[DATE_RANGE_COL.PREV_CORR_TOT]).toBe(89.5);
    expect(d[DATE_RANGE_COL.BATTERY]).toBe(80);
    expect(d[DATE_RANGE_COL.ALARMS]).toBe("NORMAL");
    expect(d[DATE_RANGE_COL.DATE]).toBe("2026-08-01");
  });

  it("stream numbers are sequential within a single meter", () => {
    const meters = [
      makeMeter({ deviceId: "d1", readings: [
        makeReading({ id: "a1", deviceId: "d1", customerName: "CUST A" }),
        makeReading({ id: "a2", deviceId: "d1", readingDate: "2026-08-02T00:00:00.000Z", customerName: "CUST A" }),
      ]}),
      makeMeter({ deviceId: "d2", deviceSerialNo: "DEV-B1", meterSerialNo: "M-B1",
        readings: [makeReading({ id: "b1", deviceId: "d2", customerName: "CUST B" })] }),
    ];
    const wb = buildCustomerReportWorkbook(meters, "dateRange");
    expect(readTable(wb, "CUST A").data.map((r) => r[DATE_RANGE_COL.STREAM])).toEqual([1, 2]);
    expect(readTable(wb, "CUST B").data.map((r) => r[DATE_RANGE_COL.STREAM])).toEqual([1]);
  });

  it("stream number restarts at 1 for each meter, while SR.NO stays continuous", () => {
    // Customer with 2 meters, 2 readings each -> STREAM NO should read 1,2,1,2 (not 1,2,3,4).
    const meters = [
      makeMeter({ deviceId: "d1", deviceSerialNo: "DEV-001", meterSerialNo: "MTR-1", readings: [
        makeReading({ id: "a1", deviceId: "d1", meterSerialNo: "MTR-1", customerName: "MULTI METER CO", readingDate: "2026-09-28T00:00:00.000Z" }),
        makeReading({ id: "a2", deviceId: "d1", meterSerialNo: "MTR-1", customerName: "MULTI METER CO", readingDate: "2026-09-29T00:00:00.000Z" }),
      ]}),
      makeMeter({ deviceId: "d2", deviceSerialNo: "DEV-002", meterSerialNo: "MTR-2", readings: [
        makeReading({ id: "b1", deviceId: "d2", meterSerialNo: "MTR-2", customerName: "MULTI METER CO", readingDate: "2026-09-28T00:00:00.000Z" }),
        makeReading({ id: "b2", deviceId: "d2", meterSerialNo: "MTR-2", customerName: "MULTI METER CO", readingDate: "2026-09-29T00:00:00.000Z" }),
      ]}),
    ];
    const { data } = readTable(buildCustomerReportWorkbook(meters, "dateRange"), "MULTI METER CO");
    expect(data.map((r) => r[DATE_RANGE_COL.METER_SN])).toEqual(["MTR-1", "MTR-1", "MTR-2", "MTR-2"]);
    expect(data.map((r) => r[DATE_RANGE_COL.STREAM])).toEqual([1, 2, 1, 2]);
    expect(data.map((r) => r[DATE_RANGE_COL.SR_NO])).toEqual([1, 2, 3, 4]);
  });

  it("skips customers with no readings", () => {
    const meters = [
      { deviceId: "d1", deviceSerialNo: "DEV-001", meterSerialNo: "M-001", readings: [] },
      makeMeter({ deviceId: "d2", deviceSerialNo: "DEV-002", meterSerialNo: "M-002",
        readings: [makeReading({ id: "r2", deviceId: "d2", customerName: "ACTIVE" })] }),
    ];
    const wb = buildCustomerReportWorkbook(meters, "dateRange");
    expect(sheetNames(wb)).toEqual(["ACTIVE"]);
  });

  it("returns empty workbook when no readings at all", () => {
    expect(sheetNames(buildCustomerReportWorkbook([], "dateRange"))).toEqual([]);
  });

  it("deduplicates sheet names on collision", () => {
    const meters = [
      makeMeter({ deviceId: "d1", readings: [makeReading({ id: "r1", deviceId: "d1", customerName: "Meter:001" })] }),
      makeMeter({ deviceId: "d2", readings: [makeReading({ id: "r2", deviceId: "d2", customerName: "Meter*001" })] }),
    ];
    const names = sheetNames(buildCustomerReportWorkbook(meters, "dateRange"));
    expect(names).toHaveLength(2);
    expect(names[0]).not.toBe(names[1]);
  });

  it("uses fallback name for empty customer name", () => {
    const meters = [
      makeMeter({ deviceId: "d1", readings: [makeReading({ id: "r1", deviceId: "d1", customerName: "" })] }),
    ];
    expect(sheetNames(buildCustomerReportWorkbook(meters, "dateRange"))).toContain("Customer");
  });

  it("handles multiple meters per customer: each reading is its own row, SR.NO continuous, STREAM NO per-meter", () => {
    const meters = [
      makeMeter({ deviceId: "d1", deviceSerialNo: "DEV-001", meterSerialNo: "M-001",
        readings: [makeReading({ id: "r1", deviceId: "d1", customerName: "MULTI", meterSerialNo: "M-001" })] }),
      makeMeter({ deviceId: "d2", deviceSerialNo: "DEV-002", meterSerialNo: "M-002",
        readings: [makeReading({ id: "r2", deviceId: "d2", customerName: "MULTI", meterSerialNo: "M-002" })] }),
    ];
    const { data } = readTable(buildCustomerReportWorkbook(meters, "dateRange"), "MULTI");
    expect(data.map((r) => r[DATE_RANGE_COL.SR_NO])).toEqual([1, 2]);
    expect(data.map((r) => r[DATE_RANGE_COL.METER_SN])).toEqual(["M-001", "M-002"]);
    // Each meter has only 1 reading, so STREAM NO restarts at 1 for both -> [1, 1], not [1, 2].
    expect(data.map((r) => r[DATE_RANGE_COL.STREAM])).toEqual([1, 1]);
  });

  it("defaults to dateRange when mode omitted", () => {
    const meters = [
      makeMeter({ deviceId: "d1", readings: [makeReading({ id: "r1", deviceId: "d1", customerName: "DEFAULT" })] }),
    ];
    const wb = buildCustomerReportWorkbook(meters);
    expect(sheetNames(wb)).toEqual(["DEFAULT"]);
    expect(readCustomerDetails(wb, "DEFAULT")["Customer Name"]).toBe("DEFAULT");
  });
});

// ── rangeSelection mode ────────────────────────────────────────────────────

describe("buildCustomerReportWorkbook — rangeSelection mode", () => {
  it("puts all customers on ONE worksheet, one row per meter", () => {
    const meters = [
      makeMeter({ deviceId: "d1", deviceSerialNo: "DEV-A1", meterSerialNo: "M-A1",
        readings: [makeReading({ id: "r1", deviceId: "d1", customerName: "CUST A", meterSerialNo: "M-A1" })] }),
      makeMeter({ deviceId: "d2", deviceSerialNo: "DEV-B1", meterSerialNo: "M-B1",
        readings: [makeReading({ id: "r2", deviceId: "d2", customerName: "CUST B", meterSerialNo: "M-B1" })] }),
    ];
    const wb = buildCustomerReportWorkbook(meters, "rangeSelection");
    expect(sheetNames(wb)).toEqual(["Range Report"]);

    const { header, data } = readTable(wb, "Range Report");
    expect(header).toHaveLength(20);
    expect(data).toHaveLength(2);
    expect(data.map((r) => r[RANGE_COL.NAME])).toEqual(["CUST A", "CUST B"]);
    expect(data.map((r) => r[RANGE_COL.METER_SN])).toEqual(["M-A1", "M-B1"]);
  });

  it("has no customer header block (that is dateRange only)", () => {
    const meters = [makeMeter({ readings: [makeReading({ customerName: "CUST A" })] })];
    const rows = sheetRows(buildCustomerReportWorkbook(meters, "rangeSelection"), "Range Report");
    expect(rows[0][0]).toBe("SR.NO");
  });

  it("SR.NO runs across customers; STREAM NO restarts for each customer; customers sorted", () => {
    const meters = [
      makeMeter({ deviceId: "d1", deviceSerialNo: "DEV-C", meterSerialNo: "M-C",
        readings: [makeReading({ id: "r1", deviceId: "d1", customerName: "CUST C", meterSerialNo: "M-C" })] }),
      makeMeter({ deviceId: "d2", deviceSerialNo: "DEV-A1", meterSerialNo: "M-A1",
        readings: [makeReading({ id: "r2", deviceId: "d2", customerName: "CUST A", meterSerialNo: "M-A1" })] }),
      makeMeter({ deviceId: "d3", deviceSerialNo: "DEV-A2", meterSerialNo: "M-A2",
        readings: [makeReading({ id: "r3", deviceId: "d3", customerName: "CUST A", meterSerialNo: "M-A2" })] }),
    ];
    const { data } = readTable(buildCustomerReportWorkbook(meters, "rangeSelection"), "Range Report");
    expect(data.map((r) => r[RANGE_COL.NAME])).toEqual(["CUST A", "CUST A", "CUST C"]);
    expect(data.map((r) => r[RANGE_COL.SR_NO])).toEqual([1, 2, 3]);
    expect(data.map((r) => r[RANGE_COL.STREAM])).toEqual([1, 2, 1]);
  });

  it("a customer with multiple meters gets one row per meter, sorted by meter serial", () => {
    const meters = [
      makeMeter({ deviceId: "d2", deviceSerialNo: "DEV-A2", meterSerialNo: "M-A2",
        readings: [makeReading({ id: "r2", deviceId: "d2", customerName: "ONE CUST", meterSerialNo: "M-A2" })] }),
      makeMeter({ deviceId: "d1", deviceSerialNo: "DEV-A1", meterSerialNo: "M-A1",
        readings: [makeReading({ id: "r1", deviceId: "d1", customerName: "ONE CUST", meterSerialNo: "M-A1" })] }),
      makeMeter({ deviceId: "d3", deviceSerialNo: "DEV-A3", meterSerialNo: "M-A3",
        readings: [makeReading({ id: "r3", deviceId: "d3", customerName: "ONE CUST", meterSerialNo: "M-A3" })] }),
    ];
    const { data } = readTable(buildCustomerReportWorkbook(meters, "rangeSelection"), "Range Report");
    expect(data).toHaveLength(3);
    expect(data.map((r) => r[RANGE_COL.METER_SN])).toEqual(["M-A1", "M-A2", "M-A3"]);
    expect(data.map((r) => r[RANGE_COL.STREAM])).toEqual([1, 2, 3]);
    expect(data.map((r) => r[RANGE_COL.SR_NO])).toEqual([1, 2, 3]);
  });

  it("takes the last reading per meter and never sums meters together", () => {
    const meters = [
      makeMeter({ deviceId: "d1", deviceSerialNo: "DEV-A1", meterSerialNo: "M-A1",
        readings: [
          makeReading({ id: "r1", deviceId: "d1", customerName: "SUMCUSTOMER", meterSerialNo: "M-A1",
            correctedVolumeVb: 100, gasPressure: 1.0, batteryLevel: 80 }),
          makeReading({ id: "r2", deviceId: "d1", readingDate: "2026-08-02T00:00:00.000Z",
            customerName: "SUMCUSTOMER", meterSerialNo: "M-A1",
            correctedVolumeVb: 200, gasPressure: 2.0, batteryLevel: 90 }),
        ]}),
      makeMeter({ deviceId: "d2", deviceSerialNo: "DEV-A2", meterSerialNo: "M-A2",
        readings: [
          makeReading({ id: "r3", deviceId: "d2", customerName: "SUMCUSTOMER", meterSerialNo: "M-A2",
            correctedVolumeVb: 300, gasPressure: 3.0, batteryLevel: 70 }),
        ]}),
    ];
    const { data } = readTable(buildCustomerReportWorkbook(meters, "rangeSelection"), "Range Report");
    expect(data).toHaveLength(2);
    expect(data[0][RANGE_COL.METER_SN]).toBe("M-A1");
    expect(data[0][RANGE_COL.CORR_VB]).toBe(200); // last reading, NOT 100+200
    expect(data[0][RANGE_COL.PRESSURE]).toBe(2.0);
    expect(data[0][RANGE_COL.BATTERY]).toBe(90);
    expect(data[1][RANGE_COL.METER_SN]).toBe("M-A2");
    expect(data[1][RANGE_COL.CORR_VB]).toBe(300); // not merged with M-A1
    expect(data[1][RANGE_COL.PRESSURE]).toBe(3.0);
  });

  it("returns empty workbook when no readings", () => {
    expect(sheetNames(buildCustomerReportWorkbook([], "rangeSelection"))).toEqual([]);
  });

  it("returns empty workbook when every meter has no readings", () => {
    const meters = [{ deviceId: "d1", deviceSerialNo: "DEV-001", meterSerialNo: "M-001", readings: [] }];
    expect(sheetNames(buildCustomerReportWorkbook(meters, "rangeSelection"))).toEqual([]);
  });
});