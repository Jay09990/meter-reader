import { describe, it, expect } from "vitest";
import type { MeterReportGroup, ReportReading } from "@/features/reports";
import type ExcelJS from "exceljs";
import {
  sanitizeSheetName,
  buildCustomerReportWorkbook,
  AMR_REPORT_HEADERS,
  AMR_REPORT_UNITS,
} from "./report-excel";
import { groupReadingsByMeter } from "./report-excel-common";

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
function sheetNames(wb: ExcelJS.Workbook): string[] {
  return wb.worksheets.map((ws) => ws.name);
}
function sheetRows(wb: ExcelJS.Workbook, name: string): (string | number)[][] {
  const ws = wb.getWorksheet(name);
  if (!ws) return [];
  const rows: (string | number)[][] = [];
  ws.eachRow((row) => {
    rows.push((row.values as (string | number | undefined)[]).slice(1) as (string | number)[]);
  });
  return rows;
}
function makeMeter(overrides: Partial<MeterReportGroup> = {}): MeterReportGroup {
  const meterSerialNo = overrides.meterSerialNo ?? "METER-001";
  const deviceSerialNo = overrides.deviceSerialNo ?? "DEV-001";
  const deviceId = overrides.deviceId ?? "d1";
  const readings: ReportReading[] = overrides.readings ?? [];
  // Propagate meter-level fields to readings that don't override them
  const propagatedReadings = readings.map(r => ({
    ...r,
    deviceId: r.deviceId ?? deviceId,
    deviceSerialNo: r.deviceSerialNo ?? deviceSerialNo,
    meterSerialNo: r.meterSerialNo ?? meterSerialNo,
  }));
  return { deviceId, deviceSerialNo, meterSerialNo, readings: propagatedReadings, ...overrides };
}

// Column index constants (after adding METER SERIAL NO)
const COL = {
  SR_NO: 0, NAME: 1, CATEGORY: 2, SOURCE: 3, METER_SN: 4, STREAM: 5,
  PRESSURE: 6, TEMP: 7, CF: 8, FLOW: 9, CORR_VB: 10, UNC_VM: 11,
  PREV_UNC: 12, PREV_CORR: 13, PREV_UNC_TOT: 14, PREV_CORR_TOT: 15,
  BATTERY: 16, ALARMS: 17, DATE: 18,
};

// ── sanitizeSheetName ──────────────────────────────────────────────────────

describe("sanitizeSheetName", () => {
  it("removes Excel-invalid chars", () => {
    const s = new Set();
    expect(sanitizeSheetName("Meter/001:Main*", "Fallback", s)).toBe("Meter_001_Main_");
  });
  it("truncates to 31 chars", () => {
    const s = new Set();
    const n = sanitizeSheetName("A".repeat(50), "Fallback", s);
    expect(n.length).toBeLessThanOrEqual(31);
  });
  it("uses fallback when empty", () => {
    const s = new Set();
    expect(sanitizeSheetName("", "Fallback", s)).toBe("Fallback");
  });
  it("deduplicates collisions", () => {
    const s = new Set();
    const a = sanitizeSheetName("A:001", "Fallback", s);
    const b = sanitizeSheetName("A*001", "Fallback2", s);
    expect(a).not.toBe(b);
  });
});

// ── dateRange mode ─────────────────────────────────────────────────────────

describe("buildCustomerReportWorkbook — dateRange mode", () => {
  it("creates one sheet per customer, sorted alphabetically", () => {
    const meters: MeterReportGroup[] = [
      makeMeter({ deviceId: "d1", readings: [makeReading({ id: "r1", deviceId: "d1", customerName: "REDEEM CHURCH" })] }),
      makeMeter({ deviceId: "d2", deviceSerialNo: "DEV-002", meterSerialNo: "M-002",
        readings: [makeReading({ id: "r2", deviceId: "d2", customerName: "ANOTHER CLIENT" })] }),
    ];
    const wb = buildCustomerReportWorkbook(meters, "dateRange");
    expect(sheetNames(wb)).toEqual(["ANOTHER CLIENT", "REDEEM CHURCH"]);
    expect(sheetRows(wb, "REDEEM CHURCH")).toHaveLength(3); // hdr + units + 1 row
    expect(sheetRows(wb, "ANOTHER CLIENT")).toHaveLength(3);
  });

  it("maps reading fields correctly with new 19-column layout", () => {
    const meters: MeterReportGroup[] = [
      makeMeter({ readings: [makeReading({ customerName: "REDEEM CHURCH", customerCategory: "PNG" })] }),
    ];
    const wb = buildCustomerReportWorkbook(meters, "dateRange");
    const rows = sheetRows(wb, "REDEEM CHURCH");
    const d = rows[2];
    expect(d[COL.SR_NO]).toBe(1);             // SR.NO
    expect(d[COL.NAME]).toBe("REDEEM CHURCH"); // NAME
    expect(d[COL.CATEGORY]).toBe("PNG");       // CATEGORY
    expect(d[COL.SOURCE]).toBe("IBAFO");       // SOURCE
    expect(d[COL.METER_SN]).toBe("METER-001"); // METER SERIAL NO (new)
    expect(d[COL.STREAM]).toBe(1);             // STREAM NO
    expect(d[COL.PRESSURE]).toBe(1.2);         // PRESSURE
    expect(d[COL.TEMP]).toBe(20);              // TEMP
    expect(d[COL.CF]).toBe(1.05);              // CF
    expect(d[COL.FLOW]).toBe(12.5);            // FLOW
    expect(d[COL.CORR_VB]).toBe(100);          // CORR TOTALIZER
    expect(d[COL.UNC_VM]).toBe(95);            // UNC TOTALIZER
    expect(d[COL.PREV_UNC]).toBe(10);          // PREV UNC
    expect(d[COL.PREV_CORR]).toBe(10.5);       // PREV CORR
    expect(d[COL.PREV_UNC_TOT]).toBe(85);      // PREV UNC TOT
    expect(d[COL.PREV_CORR_TOT]).toBe(89.5);   // PREV CORR TOT
    expect(d[COL.BATTERY]).toBe(80);           // BATTERY
    expect(d[COL.ALARMS]).toBe("NORMAL");      // ALARMS
    expect(d[COL.DATE]).toBe("2026-08-01");    // DATE
  });

  it("stream numbers are sequential within a customer sheet", () => {
    const meters: MeterReportGroup[] = [
      makeMeter({ deviceId: "d1", readings: [
        makeReading({ id: "a1", deviceId: "d1", customerName: "CUST A" }),
        makeReading({ id: "a2", deviceId: "d1", readingDate: "2026-08-02T00:00:00.000Z", customerName: "CUST A" }),
      ]}),
      makeMeter({ deviceId: "d2", deviceSerialNo: "DEV-B1", meterSerialNo: "M-B1",
        readings: [makeReading({ id: "b1", deviceId: "d2", customerName: "CUST B" })] }),
    ];
    const wb = buildCustomerReportWorkbook(meters, "dateRange");
    const rowsA = sheetRows(wb, "CUST A");
    const rowsB = sheetRows(wb, "CUST B");
    expect(rowsA.slice(2).map(r => r[COL.STREAM])).toEqual([1, 2]);
    expect(rowsB.slice(2).map(r => r[COL.STREAM])).toEqual([1]);
  });

  it("skips customers with no readings", () => {
    const meters: MeterReportGroup[] = [
      { deviceId: "d1", deviceSerialNo: "DEV-001", meterSerialNo: "M-001", readings: [] },
      makeMeter({ deviceId: "d2", deviceSerialNo: "DEV-002", meterSerialNo: "M-002",
        readings: [makeReading({ id: "r2", deviceId: "d2", customerName: "ACTIVE" })] }),
    ];
    const wb = buildCustomerReportWorkbook(meters, "dateRange");
    expect(sheetNames(wb)).toEqual(["ACTIVE"]);
    expect(sheetRows(wb, "ACTIVE")).toHaveLength(3);
  });

  it("returns empty workbook when no readings at all", () => {
    const meters: MeterReportGroup[] = [];
    const wb = buildCustomerReportWorkbook(meters, "dateRange");
    expect(sheetNames(wb)).toEqual([]);
  });

  it("deduplicates sheet names on collision", () => {
    const meters: MeterReportGroup[] = [
      makeMeter({ deviceId: "d1", readings: [makeReading({ id: "r1", deviceId: "d1", customerName: "Meter:001" })] }),
      makeMeter({ deviceId: "d2", readings: [makeReading({ id: "r2", deviceId: "d2", customerName: "Meter*001" })] }),
    ];
    const wb = buildCustomerReportWorkbook(meters, "dateRange");
    const names = sheetNames(wb);
    expect(names).toHaveLength(2);
    expect(names[0]).not.toBe(names[1]);
  });

  it("uses fallback name for empty customer name", () => {
    const meters: MeterReportGroup[] = [
      makeMeter({ deviceId: "d1", readings: [makeReading({ id: "r1", deviceId: "d1", customerName: "" })] }),
    ];
    const wb = buildCustomerReportWorkbook(meters, "dateRange");
    expect(sheetNames(wb)).toContain("Customer");
  });

  it("handles multiple meters per customer (dateRange)", () => {
    const meters: MeterReportGroup[] = [
      makeMeter({ deviceId: "d1", deviceSerialNo: "DEV-001", meterSerialNo: "M-001",
        readings: [makeReading({ id: "r1", deviceId: "d1", customerName: "MULTI", meterSerialNo: "M-001" })] }),
      makeMeter({ deviceId: "d2", deviceSerialNo: "DEV-002", meterSerialNo: "M-002",
        readings: [makeReading({ id: "r2", deviceId: "d2", customerName: "MULTI", meterSerialNo: "M-002" })] }),
    ];
    const wb = buildCustomerReportWorkbook(meters, "dateRange");
    const rows = sheetRows(wb, "MULTI");
    expect(rows.slice(2).map(r => r[COL.SR_NO])).toEqual([1, 2]);
    expect(rows.slice(2).map(r => r[COL.METER_SN])).toEqual(["M-001", "M-002"]);
    expect(rows.slice(2).map(r => r[COL.STREAM])).toEqual([1, 2]);
  });

  it("defaults to dateRange when mode omitted", () => {
    const meters: MeterReportGroup[] = [
      makeMeter({ deviceId: "d1", readings: [makeReading({ id: "r1", deviceId: "d1", customerName: "DEFAULT" })] }),
    ];
    const wb = buildCustomerReportWorkbook(meters);
    expect(sheetNames(wb)).toEqual(["DEFAULT"]);
    expect(sheetRows(wb, "DEFAULT")).toHaveLength(3);
  });
});

// ── rangeSelection mode ────────────────────────────────────────────────────

describe("buildCustomerReportWorkbook — rangeSelection mode", () => {
  it("creates per-customer sheets, one row per meter, stream numbers per customer", () => {
    const meters: MeterReportGroup[] = [
      makeMeter({ deviceId: "d1", deviceSerialNo: "DEV-A1", meterSerialNo: "M-A1",
        readings: [makeReading({ id: "r1", deviceId: "d1", customerName: "CUST A" })] }),
      makeMeter({ deviceId: "d2", deviceSerialNo: "DEV-B1", meterSerialNo: "M-B1",
        readings: [makeReading({ id: "r2", deviceId: "d2", customerName: "CUST B" })] }),
    ];
    const wb = buildCustomerReportWorkbook(meters, "rangeSelection");
    expect(sheetNames(wb)).toEqual(["CUST A", "CUST B"]);

    // CUST A sheet: 1 meter
    let rows = sheetRows(wb, "CUST A");
    expect(rows).toHaveLength(3); // hdr + units + 1 meter
    expect(rows[2][COL.NAME]).toBe("CUST A");
    expect(rows[2][COL.METER_SN]).toBe("M-A1");
    expect(rows[2][COL.STREAM]).toBe(1);

    // CUST B sheet: 1 meter, stream resets
    rows = sheetRows(wb, "CUST B");
    expect(rows).toHaveLength(3);
    expect(rows[2][COL.NAME]).toBe("CUST B");
    expect(rows[2][COL.METER_SN]).toBe("M-B1");
    expect(rows[2][COL.STREAM]).toBe(1);
  });

  it("3 customers: per-customer sheets, stream resets each sheet", () => {
    const meters: MeterReportGroup[] = [
      makeMeter({ deviceId: "d1", deviceSerialNo: "DEV-C", meterSerialNo: "M-C",
        readings: [makeReading({ id: "r1", deviceId: "d1", customerName: "CUST C", meterSerialNo: "M-C" })] }),
      makeMeter({ deviceId: "d2", deviceSerialNo: "DEV-A", meterSerialNo: "M-A",
        readings: [makeReading({ id: "r2", deviceId: "d2", customerName: "CUST A", meterSerialNo: "M-A" })] }),
      makeMeter({ deviceId: "d3", deviceSerialNo: "DEV-B", meterSerialNo: "M-B",
        readings: [makeReading({ id: "r3", deviceId: "d3", customerName: "CUST B", meterSerialNo: "M-B" })] }),
    ];
    const wb = buildCustomerReportWorkbook(meters, "rangeSelection");
    expect(sheetNames(wb)).toEqual(["CUST A", "CUST B", "CUST C"]);

    // CUST A
    let rows = sheetRows(wb, "CUST A");
    expect(rows).toHaveLength(3);
    expect(rows[2][COL.NAME]).toBe("CUST A");
    expect(rows[2][COL.STREAM]).toBe(1);

    // CUST B
    rows = sheetRows(wb, "CUST B");
    expect(rows).toHaveLength(4);
    expect(rows[2][COL.NAME]).toBe("CUST B");
    expect(rows[2][COL.STREAM]).toBe(1);

    // CUST C
    rows = sheetRows(wb, "CUST C");
    expect(rows).toHaveLength(4);
    expect(rows[2][COL.NAME]).toBe("CUST C");
    expect(rows[2][COL.STREAM]).toBe(1);
  });

  it("within a single customer, multiple meters get sequential stream numbers", () => {
    const meters: MeterReportGroup[] = [
      makeMeter({ deviceId: "d1", deviceSerialNo: "DEV-A1", meterSerialNo: "M-A1",
        readings: [makeReading({ id: "r1", deviceId: "d1", customerName: "ONE CUST", meterSerialNo: "M-A1" })] }),
      makeMeter({ deviceId: "d2", deviceSerialNo: "DEV-A2", meterSerialNo: "M-A2",
        readings: [makeReading({ id: "r2", deviceId: "d2", customerName: "ONE CUST", meterSerialNo: "M-A2" })] }),
      makeMeter({ deviceId: "d3", deviceSerialNo: "DEV-A3", meterSerialNo: "M-A3",
        readings: [makeReading({ id: "r3", deviceId: "d3", customerName: "ONE CUST", meterSerialNo: "M-A3" })] }),
    ];
    const wb = buildCustomerReportWorkbook(meters, "rangeSelection");
    expect(sheetNames(wb)).toEqual(["ONE CUST"]);
    const rows = sheetRows(wb, "ONE CUST");
    expect(rows).toHaveLength(5); // hdr + units + 3 meters
    expect(rows[2][COL.METER_SN]).toBe("M-A1");
    expect(rows[2][COL.STREAM]).toBe(1);
    expect(rows[2][COL.SR_NO]).toBe(1);
    expect(rows[3][COL.METER_SN]).toBe("M-A2");
    expect(rows[3][COL.STREAM]).toBe(2);
    expect(rows[3][COL.SR_NO]).toBe(2);
    expect(rows[4][COL.METER_SN]).toBe("M-A3");
    expect(rows[4][COL.STREAM]).toBe(3);
    expect(rows[4][COL.SR_NO]).toBe(3);
  });

  it("per-customer sheets, SR.NO per-meter within each sheet", () => {
    const meters: MeterReportGroup[] = [
      makeMeter({ deviceId: "d1", readings: [
        makeReading({ id: "r1", deviceId: "d1", customerName: "CUST X", correctedVolumeVb: 10 }),
      ]}),
      makeMeter({ deviceId: "d2", readings: [
        makeReading({ id: "r2", deviceId: "d2", customerName: "CUST Y", correctedVolumeVb: 20 }),
      ]}),
      makeMeter({ deviceId: "d3", readings: [
        makeReading({ id: "r3", deviceId: "d3", customerName: "CUST Z", correctedVolumeVb: 30 }),
      ]}),
    ];
    const wb = buildCustomerReportWorkbook(meters, "rangeSelection");
    expect(sheetNames(wb)).toEqual(["CUST X", "CUST Y", "CUST Z"]);

    let rows = sheetRows(wb, "CUST X");
    expect(rows).toHaveLength(4); // hdr + units + 1 meter
    expect(rows[2][COL.SR_NO]).toBe(1);

    rows = sheetRows(wb, "CUST Y");
    expect(rows[2][COL.SR_NO]).toBe(1);

    rows = sheetRows(wb, "CUST Z");
    expect(rows[2][COL.SR_NO]).toBe(1);
  });

  it("takes last reading per meter (not summed) in rangeSelection", () => {
    const meters: MeterReportGroup[] = [
      makeMeter({ deviceId: "d1", deviceSerialNo: "DEV-A1", meterSerialNo: "M-A1",
        readings: [
          makeReading({ id: "r1", deviceId: "d1", customerName: "SUMCUSTOMER", meterSerialNo: "M-A1",
            correctedVolumeVb: 100, uncorrectedVolumeVm: 90,
            gasPressure: 1.0, gasTemperature: 25, currentFlowRate: 10, batteryLevel: 80 }),
          makeReading({ id: "r2", deviceId: "d1", readingDate: "2026-08-02T00:00:00.000Z",
            customerName: "SUMCUSTOMER", meterSerialNo: "M-A1",
            correctedVolumeVb: 200, uncorrectedVolumeVm: 180,
            gasPressure: 2.0, gasTemperature: 30, currentFlowRate: 20, batteryLevel: 90 }),
        ]}),
      makeMeter({ deviceId: "d2", deviceSerialNo: "DEV-A2", meterSerialNo: "M-A2",
        readings: [
          makeReading({ id: "r3", deviceId: "d2", customerName: "SUMCUSTOMER", meterSerialNo: "M-A2",
            correctedVolumeVb: 300, uncorrectedVolumeVm: 270,
            gasPressure: 3.0, gasTemperature: 35, currentFlowRate: 30, batteryLevel: 70 }),
        ]}),
    ];
    const wb = buildCustomerReportWorkbook(meters, "rangeSelection");
    const rows = sheetRows(wb, "SUMCUSTOMER");
    // 2 header + 2 meters = 4 rows
    expect(rows).toHaveLength(4);
    // First meter (M-A1): last reading has correctedVolumeVb=200, pressure=2.0
    expect(rows[2][COL.METER_SN]).toBe("M-A1");
    expect(rows[2][COL.STREAM]).toBe(1);
    expect(rows[2][COL.CORR_VB]).toBe(200);      // last reading, NOT 100+200=300
    expect(rows[2][COL.PRESSURE]).toBe(2.0);     // last reading
    expect(rows[2][COL.BATTERY]).toBe(90);       // last reading
    // Second meter (M-A2): only one reading, correctedVolumeVb=300
    expect(rows[3][COL.METER_SN]).toBe("M-A2");
    expect(rows[3][COL.STREAM]).toBe(2);
    expect(rows[3][COL.CORR_VB]).toBe(300);
    expect(rows[3][COL.PRESSURE]).toBe(3.0);
    expect(rows[3][COL.BATTERY]).toBe(70);
  });

  it("returns empty workbook when no readings", () => {
    const meters: MeterReportGroup[] = [];
    const wb = buildCustomerReportWorkbook(meters, "rangeSelection");
    expect(sheetNames(wb)).toEqual([]);
  });

  it("defaults to dateRange when mode omitted", () => {
    const meters: MeterReportGroup[] = [
      makeMeter({ deviceId: "d1", readings: [makeReading({ id: "r1", deviceId: "d1", customerName: "DEFAULT" })] }),
    ];
    const wb = buildCustomerReportWorkbook(meters);
    expect(sheetNames(wb)).toEqual(["DEFAULT"]);
    expect(sheetRows(wb, "DEFAULT")).toHaveLength(3);
  });
});
