// lib/report-excel.ts
import ExcelJS from "exceljs";
import type { MeterReportGroup, ReportMode, ReportReading } from "@/features/reports";

// ── Re-export for backward compatibility ──────────────────────────────────

export function groupReadingsByMeter(readings: ReportReading[]): MeterReportGroup[] {
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

// ── Sheet name helpers ────────────────────────────────────────────────────

const EXCEL_SHEET_NAME_INVALID_CHARS = /[\\/?:*[\]]/g;
const MAX_SHEET_NAME_LENGTH = 31;

export function sanitizeSheetName(
  rawName: string,
  fallback: string,
  usedNames: Set<string>,
): string {
  let name = (rawName || "").replace(EXCEL_SHEET_NAME_INVALID_CHARS, "_").trim();
  if (!name) name = fallback;
  name = name.slice(0, MAX_SHEET_NAME_LENGTH);

  let candidate = name;
  let suffix = 1;
  while (usedNames.has(candidate)) {
    const suffixStr = `_${suffix}`;
    candidate = `${name.slice(0, MAX_SHEET_NAME_LENGTH - suffixStr.length)}${suffixStr}`;
    suffix++;
  }
  usedNames.add(candidate);
  return candidate;
}

// ── Column definitions ────────────────────────────────────────────────────

// Column order mirrors the AML reference template (AMR REPORT FORMAT.xlsx).
// "TOTAIZER" reproduces a typo in the reference; DATE is appended because the
// report covers a date range while the reference is a single-day snapshot.
export const AMR_REPORT_HEADERS = [
  "SR.NO",
  "NAME OF INDUSTRY",
  "CUSTOMER TYPE",
  "SOURCE/SEGMENT",
  "STREAM NO",
  "PRESSURE",
  "TEMPERATURE",
  "CORRECTION FACTOR",
  "CURRENT FLOWRATE (CORRECTED)",
  "CORRECTED VOLUME TOTALIZER",
  "UNCORRECTED VOLUME TOTALIZER",
  "PREVIOUS DAY UNCORRECTED",
  "PREVIOUS DAY CORRECTED",
  "PREVIOUS DAY UNCORRECTED TOTALIZER",
  "PREVIOUS DAY CORRECTED TOTAIZER",
  "EVC BATTERY/BALANCE DAYS",
  "ALARMS",
  "DATE",
];

export const AMR_REPORT_UNITS = [
  "—", "—", "—", "—", "—", "Bar", "°C", "—", "SCMH", "SCM", "m³", "m³",
  "SCMD", "m³", "SCM", "%", "—", "—",
];

type Align = "left" | "center";
const AMR_REPORT_ALIGN: Align[] = [
  "center", // SR.NO
  "left",   // NAME OF INDUSTRY
  "left",   // CUSTOMER TYPE
  "left",   // SOURCE/SEGMENT
  "left",   // STREAM NO
  "center", // PRESSURE
  "center", // TEMPERATURE
  "center", // CORRECTION FACTOR
  "center", // CURRENT FLOWRATE (CORRECTED)
  "center", // CORRECTED VOLUME TOTALIZER
  "center", // UNCORRECTED VOLUME TOTALIZER
  "center", // PREVIOUS DAY UNCORRECTED
  "center", // PREVIOUS DAY CORRECTED
  "center", // PREVIOUS DAY UNCORRECTED TOTALIZER
  "center", // PREVIOUS DAY CORRECTED TOTAIZER
  "center", // EVC BATTERY/BALANCE DAYS
  "left",   // ALARMS
  "center", // DATE
];

// ── Row builders ──────────────────────────────────────────────────────────

function fmtVal(val: number | null | undefined): string | number {
  if (val === null || val === undefined) return "-";
  return val;
}

function readingDay(row: ReportReading): string {
  const d = new Date(row.readingDate);
  if (!isNaN(d.getTime()) && d.getFullYear() > 1970) {
    return row.readingDate.split("T")[0];
  }
  return row.receivedAt.split("T")[0];
}

/** Builds one AMR-format row for a single reading (used by dateRange mode). */
function toExcelRowAoa(row: ReportReading, srNo: number): (string | number)[] {
  return [
    srNo,
    row.customerName || "-",
    row.customerCategory || "-",
    "IBAFO",
    row.meterSerialNo || row.deviceSerialNo || "-",
    fmtVal(row.gasPressure),
    fmtVal(row.gasTemperature),
    fmtVal(row.correctionFactor),
    fmtVal(row.currentFlowRate),
    fmtVal(row.correctedVolumeVb),
    fmtVal(row.uncorrectedVolumeVm),
    fmtVal(row.prevDayUncorrected),
    fmtVal(row.prevDayCorrected),
    fmtVal(row.prevDayUncorrectedTotalizer),
    fmtVal(row.prevDayCorrectedTotalizer),
    row.batteryLevel != null ? Math.round(row.batteryLevel) : "-",
    row.alarms || "NORMAL",
    readingDay(row),
  ];
}

/**
 * Sums numeric columns across all readings of a customer (used by
 * rangeSelection mode — one row per customer, all meters aggregated).
 */
function summarizeCustomerRow(readings: ReportReading[], srNo: number): (string | number)[] {
  if (readings.length === 0) {
    return [
      srNo, "-", "-", "IBAFO", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "NORMAL", "-",
    ];
  }

  let sumCorrectedVolumeVb = 0;
  let sumUncorrectedVolumeVm = 0;
  let sumPrevDayUncorrected = 0;
  let sumPrevDayCorrected = 0;
  let sumPrevDayUncorrectedTotalizer = 0;
  let sumPrevDayCorrectedTotalizer = 0;
  let pressureSum = 0, pressureCount = 0;
  let tempSum = 0, tempCount = 0;
  let cfSum = 0, cfCount = 0;
  let flowSum = 0, flowCount = 0;
  let batterySum = 0, batteryCount = 0;

  let latestDate = readings[0].readingDate;
  const alarmSet = new Set<string>();
  let latestCustomerName = readings[0].customerName || "Unknown";
  let latestCustomerCategory = readings[0].customerCategory || "-";
  let latestMeterSerialNo = readings[0].meterSerialNo || readings[0].deviceSerialNo || "-";

  for (const r of readings) {
    if (r.correctedVolumeVb != null) sumCorrectedVolumeVb += r.correctedVolumeVb;
    if (r.uncorrectedVolumeVm != null) sumUncorrectedVolumeVm += r.uncorrectedVolumeVm;
    if (r.prevDayUncorrected != null) sumPrevDayUncorrected += r.prevDayUncorrected;
    if (r.prevDayCorrected != null) sumPrevDayCorrected += r.prevDayCorrected;
    if (r.prevDayUncorrectedTotalizer != null) sumPrevDayUncorrectedTotalizer += r.prevDayUncorrectedTotalizer;
    if (r.prevDayCorrectedTotalizer != null) sumPrevDayCorrectedTotalizer += r.prevDayCorrectedTotalizer;

    if (r.gasPressure != null) { pressureSum += r.gasPressure; pressureCount++; }
    if (r.gasTemperature != null) { tempSum += r.gasTemperature; tempCount++; }
    if (r.correctionFactor != null) { cfSum += r.correctionFactor; cfCount++; }
    if (r.currentFlowRate != null) { flowSum += r.currentFlowRate; flowCount++; }
    if (r.batteryLevel != null) { batterySum += r.batteryLevel; batteryCount++; }

    if (r.readingDate > latestDate) latestDate = r.readingDate;
    if (r.alarms && r.alarms !== "NORMAL" && r.alarms !== "---") alarmSet.add(r.alarms);
    if (r.customerName) latestCustomerName = r.customerName;
    if (r.customerCategory) latestCustomerCategory = r.customerCategory;
    if (r.meterSerialNo) latestMeterSerialNo = r.meterSerialNo;
  }

  const alarms = alarmSet.size > 0 ? [...alarmSet].join("; ") : "NORMAL";
  const avg = (sum: number, count: number) =>
    count > 0 ? Number((sum / count).toFixed(2)) : "-";

  return [
    srNo,
    latestCustomerName,
    latestCustomerCategory,
    "IBAFO",
    latestMeterSerialNo,
    avg(pressureSum, pressureCount),
    avg(tempSum, tempCount),
    avg(cfSum, cfCount),
    avg(flowSum, flowCount),
    Number(sumCorrectedVolumeVb.toFixed(3)),
    Number(sumUncorrectedVolumeVm.toFixed(3)),
    Number(sumPrevDayUncorrected.toFixed(3)),
    Number(sumPrevDayCorrected.toFixed(3)),
    Number(sumPrevDayUncorrectedTotalizer.toFixed(3)),
    Number(sumPrevDayCorrectedTotalizer.toFixed(3)),
    batteryCount > 0 ? Math.round(batterySum / batteryCount) : "-",
    alarms,
    latestDate.split("T")[0],
  ];
}

// ── Workbook builder ──────────────────────────────────────────────────────

function autoSizeColumns(worksheet: ExcelJS.Worksheet, aoa: (string | number)[][]) {
  if (aoa.length === 0) return;
  const colCount = aoa[0].length;
  worksheet.columns = Array.from({ length: colCount }, (_, c) => {
    let maxLen = 0;
    for (let r = 0; r < aoa.length; r++) {
      const val = aoa[r][c];
      const len = val == null ? 0 : String(val).length;
      if (len > maxLen) maxLen = len;
    }
    return { width: Math.max(maxLen + 4, 12) };
  });
}

/**
 * Builds an Excel workbook from meter report groups.
 *
 * - `mode === "rangeSelection"`: all customers on a SINGLE worksheet.
 *   Readings grouped by customerName; numeric columns summed across all
 *   meters of the same customer → one row per customer. SR.NO restarts at 1.
 * - `mode === "dateRange"` (or omitted): legacy — one worksheet per customer,
 *   each containing that customer's meter readings with SR.NO restarting at 1.
 */
export function buildCustomerReportWorkbook(
  meters: MeterReportGroup[],
  mode?: ReportMode,
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const usedSheetNames = new Set<string>();

  if (mode === "rangeSelection") {
    // Single sheet, one row per customer, summed across all meters
    const customerMap = new Map<string, { customerName: string; customerCategory: string | null; readings: ReportReading[] }>();

    for (const group of meters) {
      for (const reading of group.readings) {
        const name = reading.customerName || "Unknown";
        let entry = customerMap.get(name);
        if (!entry) {
          entry = { customerName: name, customerCategory: reading.customerCategory, readings: [] };
          customerMap.set(name, entry);
        }
        entry.readings.push(reading);
      }
    }

    const sortedCustomers = Array.from(customerMap.values()).sort((a, b) =>
      (a.customerName || "").localeCompare(b.customerName || ""),
    );

    if (sortedCustomers.length > 0) {
      const sheetName = sanitizeSheetName(
        sortedCustomers[0].customerName || "Customers",
        "Customers",
        usedSheetNames,
      );

      const dataRows: (string | number)[][] = [];
      sortedCustomers.forEach((entry, idx) => {
        dataRows.push(summarizeCustomerRow(entry.readings, idx + 1));
      });

      const aoa = [AMR_REPORT_HEADERS, AMR_REPORT_UNITS, ...dataRows];
      const worksheet = workbook.addWorksheet(sheetName);
      autoSizeColumns(worksheet, aoa);

      aoa.forEach((rowValues, rowIndex) => {
        const row = worksheet.addRow(rowValues);
        const isHeaderRow = rowIndex === 0;
        const isUnitRow = rowIndex === 1;

        row.eachCell((cell, colIndex) => {
          cell.alignment = { horizontal: AMR_REPORT_ALIGN[colIndex - 1], vertical: "middle" };
          if (isHeaderRow) cell.font = { bold: true };
          if (isUnitRow) cell.font = { italic: true, color: { argb: "FF666666" } };
        });
      });
    }
  } else {
    // Legacy: one worksheet per customer
    const customerMap = new Map<string, MeterReportGroup[]>();
    for (const group of meters) {
      const rawName = group.readings[0]?.customerName;
      const name = rawName && rawName.trim() !== "" ? rawName : "Customer";
      const existing = customerMap.get(name) ?? [];
      existing.push(group);
      customerMap.set(name, existing);
    }

    for (const [customerName, customerMeters] of customerMap.entries()) {
      const sheetName = sanitizeSheetName(customerName, "Customer", usedSheetNames);

      const relevantReadings = customerMeters
        .filter((m) => m.readings.length > 0)
        .flatMap((m) => m.readings);

      if (relevantReadings.length === 0) continue;

      const dataRows = relevantReadings.map((r, i) => toExcelRowAoa(r, i + 1));
      const aoa = [AMR_REPORT_HEADERS, AMR_REPORT_UNITS, ...dataRows];

      const worksheet = workbook.addWorksheet(sheetName);
      autoSizeColumns(worksheet, aoa);

      aoa.forEach((rowValues, rowIndex) => {
        const row = worksheet.addRow(rowValues);
        const isHeaderRow = rowIndex === 0;
        const isUnitRow = rowIndex === 1;

        row.eachCell((cell, colIndex) => {
          cell.alignment = { horizontal: AMR_REPORT_ALIGN[colIndex - 1], vertical: "middle" };
          if (isHeaderRow) cell.font = { bold: true };
          if (isUnitRow) cell.font = { italic: true, color: { argb: "FF666666" } };
        });
      });
    }
  }

  return workbook;
}

// ── Download helper ───────────────────────────────────────────────────────

function buildReportFilename(
  mode?: ReportMode,
  startDate?: string,
  endDate?: string,
): string {
  const modeLabel = mode === "rangeSelection" ? "RangeSelection" : "DateRange";
  const dateRange = startDate && endDate ? `_${startDate}_${endDate}` : "";
  return `Customer_Report_${modeLabel}${dateRange}.xlsx`;
}

/** Triggers a browser download of the AMR report Excel file. */
export async function downloadCustomerReportExcel(
  meters: MeterReportGroup[],
  mode?: ReportMode,
  startDate?: string,
  endDate?: string,
): Promise<void> {
  const workbook = buildCustomerReportWorkbook(meters, mode);

  if (workbook.worksheets.length === 0) {
    throw new Error("No meter data available to export.");
  }

  const filename = buildReportFilename(mode, startDate, endDate);
  const buffer = await workbook.xlsx.writeBuffer();

  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
