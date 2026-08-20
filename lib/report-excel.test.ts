import { describe, it, expect } from "vitest";
import { sanitizeSheetName, buildCustomerReportWorkbook } from "./report-excel";
import type { MeterReportGroup, ReportReading } from "@/features/reports";

function makeReading(overrides: Partial<ReportReading> = {}): ReportReading {
  return {
    id: "reading-1",
    deviceId: "device-1",
    deviceSerialNo: "DEV-001",
    meterSerialNo: "METER-001",
    customerName: null,
    readingDate: "2026-08-01T00:00:00.000Z",
    receivedAt: "2026-08-01T01:00:00.000Z",
    correctedVolumeVb: 100,
    uncorrectedVolumeVm: 95,
    gasPressure: 1.2,
    gasTemperature: 20,
    batteryLevel: 80,
    consumption: null,
    ...overrides,
  };
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
  it("creates one worksheet per meter that has readings", () => {
    const meters: MeterReportGroup[] = [
      {
        deviceId: "device-1",
        deviceSerialNo: "DEV-001",
        meterSerialNo: "METER-001",
        readings: [makeReading()],
      },
      {
        deviceId: "device-2",
        deviceSerialNo: "DEV-002",
        meterSerialNo: "METER-002",
        readings: [makeReading({ id: "reading-2", deviceId: "device-2" })],
      },
    ];

    const workbook = buildCustomerReportWorkbook(meters);

    expect(workbook.SheetNames).toEqual(["METER-001", "METER-002"]);
  });

  it("skips meters with no readings in the selected range", () => {
    const meters: MeterReportGroup[] = [
      {
        deviceId: "device-1",
        deviceSerialNo: "DEV-001",
        meterSerialNo: "METER-001",
        readings: [],
      },
    ];

    const workbook = buildCustomerReportWorkbook(meters);

    expect(workbook.SheetNames).toEqual([]);
  });
});