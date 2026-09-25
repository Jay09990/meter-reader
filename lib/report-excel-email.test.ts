import { describe, it, expect } from "vitest";
import {
  sanitizeSheetName,
  buildCustomerReportWorkbook,
  AMR_REPORT_HEADERS,
  AMR_REPORT_UNITS,
} from "./report-excel";
import type { MeterReportGroup, ReportReading } from "@/features/reports";
import type ExcelJS from "exceljs";

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

function sheetRows(workbook: ExcelJS.Workbook): (string | number)[][] {
  const worksheet = workbook.getWorksheet("REPORT");
  if (!worksheet) return [];
  const rows: (string | number)[][] = [];
  worksheet.eachRow((row) => {
    const values = row.values as (string | number | undefined)[];
    rows.push(values.slice(1) as (string | number)[]); // index 0 is unused in ExcelJS
  });
  return rows;
}

function sheetNames(workbook: ExcelJS.Workbook): string[] {
  return workbook.worksheets.map((ws) => ws.name);
}

describe("sanitizeSheetName", () => {
  it("removes characters Excel disallows in sheet names", () => {
    const used = new Set<string>();
    expect(sanitizeSheetName("Meter/001:Main*", "Meter-1", used)).toBe("Meter_001_Main_");
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
  it("creates a single REPORT sheet with AMR headers and units", () => {
    const meters: MeterReportGroup[] = [
      { deviceId: "device-1", deviceSerialNo: "DEV-001", meterSerialNo: "METER-001", readings: [makeReading()] },
    ];

    const workbook = buildCustomerReportWorkbook(meters);

    expect(sheetNames(workbook)).toEqual(["REPORT"]);
    const rows = sheetRows(workbook);
    expect(rows[0]).toEqual(AMR_REPORT_HEADERS);
    expect(rows[1]).toEqual(AMR_REPORT_UNITS);
    expect(rows).toHaveLength(3);
  });

  it("maps reading fields to the AMR row layout", () => {
    const meters: MeterReportGroup[] = [
      {
        deviceId: "device-1",
        deviceSerialNo: "DEV-001",
        meterSerialNo: "METER-001",
        readings: [makeReading({ customerName: "REDEEM CHURCH", customerCategory: "PNG", gaName: "Chennai GA" })],
      },
    ];

    const rows = sheetRows(buildCustomerReportWorkbook(meters));
    const dataRow = rows[2];

    expect(dataRow[0]).toBe(1);
    expect(dataRow[1]).toBe("REDEEM CHURCH");
    expect(dataRow[2]).toBe("PNG");
    expect(dataRow[3]).toBe("IBAFO");
    expect(dataRow[4]).toBe("METER-001");
    expect(dataRow[5]).toBe(1.2);
    expect(dataRow[6]).toBe(20);
    expect(dataRow[7]).toBe(1.05);
    expect(dataRow[8]).toBe(12.5);
    expect(dataRow[9]).toBe(100);
    expect(dataRow[10]).toBe(95);
    expect(dataRow[11]).toBe(10);
    expect(dataRow[12]).toBe(10.5);
    expect(dataRow[13]).toBe(85);
    expect(dataRow[14]).toBe(89.5);
    expect(dataRow[15]).toBe(80);
    expect(dataRow[16]).toBe("NORMAL");
    expect(dataRow[17]).toBe("2026-08-01");
  });

  it("flattens readings across meters with sequential SR.NO", () => {
    const meters: MeterReportGroup[] = [
      {
        deviceId: "device-1", deviceSerialNo: "DEV-001", meterSerialNo: "METER-001",
        readings: [makeReading(), makeReading({ id: "reading-1b", readingDate: "2026-08-02T00:00:00.000Z" })],
      },
      { deviceId: "device-2", deviceSerialNo: "DEV-002", meterSerialNo: "METER-002", readings: [makeReading({ id: "reading-2", deviceId: "device-2" })] },
    ];

    const rows = sheetRows(buildCustomerReportWorkbook(meters));
    expect(rows.slice(2).map((r) => r[0])).toEqual([1, 2, 3]);
  });

  it("skips meters with no readings in the selected range", () => {
    const meters: MeterReportGroup[] = [
      { deviceId: "device-1", deviceSerialNo: "DEV-001", meterSerialNo: "METER-001", readings: [] },
      { deviceId: "device-2", deviceSerialNo: "DEV-002", meterSerialNo: "METER-002", readings: [makeReading({ id: "reading-2", deviceId: "device-2" })] },
    ];

    const workbook = buildCustomerReportWorkbook(meters);
    expect(sheetNames(workbook)).toEqual(["REPORT"]);
    expect(sheetRows(workbook)).toHaveLength(3);
  });

  it("returns an empty workbook when no meter has readings", () => {
    const meters: MeterReportGroup[] = [
      { deviceId: "device-1", deviceSerialNo: "DEV-001", meterSerialNo: "METER-001", readings: [] },
    ];

    const workbook = buildCustomerReportWorkbook(meters);
    expect(workbook.worksheets).toHaveLength(0);
  });
});