// lib/report-excel.ts
import ExcelJS from "exceljs";
import type { MeterReportGroup, ReportReading } from "@/features/reports";

/**
 * Groups a flat reading list into one bucket per device/meter.
 */
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

const EXCEL_SHEET_NAME_INVALID_CHARS = /[\\/?*[\]:]/g;
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

// Column order mirrors the AMR reference template (AMR REPORT FORMAT.xlsx).
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

// One entry per column, same order as AMR_REPORT_HEADERS. "center" = numeric
// values and units; "left" = free-text/identifier columns.
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
 * Builds an Excel workbook with one worksheet per customer. Each sheet
 * contains only that customer's meter readings in the standard AMR format,
 * with SR.NO restarting at 1 per sheet.
 */
export function buildCustomerReportWorkbook(
  customers: Array<{
    customerName: string;
    meters: MeterReportGroup[];
  }>,
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const usedSheetNames = new Set<string>();

  for (const { customerName, meters } of customers) {
    const sheetName = sanitizeSheetName(customerName, "Customer", usedSheetNames);

    const relevantReadings = meters
      .filter((meter) => meter.readings.length > 0)
      .flatMap((meter) => meter.readings);

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

  return workbook;
}

export function buildCustomerReportFilename(
  customerName: string,
  startDate: string,
  endDate: string,
): string {
  const sanitizedCustomerName = customerName.replace(/[^a-z0-9]/gi, "_");
  return `Customer_Report_${sanitizedCustomerName}_${startDate}_${endDate}.xlsx`;
}

/**
 * Builds the AMR report workbook and triggers a browser download.
 * NOTE: now async (ExcelJS writes asynchronously) — call sites need `await`.
 */
export async function downloadCustomerReportExcel(
  customers: Array<{
    customerName: string;
    meters: MeterReportGroup[];
  }>,
  startDate: string,
  endDate: string,
): Promise<void> {
  const workbook = buildCustomerReportWorkbook(customers);

  if (workbook.worksheets.length === 0) {
    throw new Error("No meter data available to export.");
  }

  // Use the first customer's name and date range for the filename
  const firstCustomer = customers[0];
  const filename = buildCustomerReportFilename(
    firstCustomer.customerName,
    startDate,
    endDate,
  );
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