import * as XLSX from "xlsx";
import type { MeterReportGroup, ReportReading, CustomerRangeReport } from "@/features/reports";

/**
 * Groups a flat reading list into one bucket per device/meter.
 * The API already returns pre-grouped `meters`, but this exists as a
 * client-side fallback so the UI degrades gracefully instead of crashing
 * if it ever receives a response without that field (e.g. a stale cached
 * route during a deploy).
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

/**
 * Sanitizes a worksheet name to comply with Excel's rules:
 * - max 31 characters
 * - no \ / ? * [ ] :
 * - falls back to a placeholder if the name becomes empty
 * - de-duplicates against names already used in the same workbook
 */
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

function autoSizeColumns(worksheet: XLSX.WorkSheet, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  worksheet["!cols"] = headers.map((header) => {
    const maxLen = rows.reduce((max, row) => {
      const val = row[header];
      const len = val == null ? 0 : String(val).length;
      return Math.max(max, len);
    }, header.length);
    return { wch: maxLen + 4 }; // padding so nothing touches the cell edge
  });
}

function toExcelRow(row: ReportReading & { consumption?: number | null }) {
  return {
    "Customer": row.customerName || "N/A",
    "Reading Date": new Date(row.readingDate).toLocaleString(),
    "Device Serial No": row.deviceSerialNo,
    "Meter Serial No": row.meterSerialNo || "N/A",
    "Consumption (Sm³)": row.consumption,
    "Corrected Volume (Sm³)": row.correctedVolumeVb,
    "Uncorrected Volume (Sm³)": row.uncorrectedVolumeVm,
    "Gas Pressure (barg)": row.gasPressure,
    "Gas Temperature (°C)": row.gasTemperature,
    "Battery Level (%)": row.batteryLevel != null ? Math.round(row.batteryLevel) : null,
  };
}

/**
 * Builds a workbook with one worksheet per meter. Meters with no readings in
 * the selected range are skipped so we never produce an empty/misleading sheet.
 */
export function buildCustomerReportWorkbook(meters: MeterReportGroup[]): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  const usedNames = new Set<string>();

  meters
    .filter((meter) => meter.readings.length > 0)
    .forEach((meter, index) => {
      const rawName = meter.meterSerialNo || meter.deviceSerialNo;
      const sheetName = sanitizeSheetName(rawName, `Meter-${index + 1}`, usedNames);
      const rows = meter.readings.map(toExcelRow);
      const worksheet = XLSX.utils.json_to_sheet(rows);
      autoSizeColumns(worksheet, rows);
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    });

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
 * Builds the per-meter workbook and triggers a browser download.
 * Throws if there's no meter data to export, so callers can surface a
 * user-friendly error message.
 */
export function downloadCustomerReportExcel(
  meters: MeterReportGroup[],
  customerName: string,
  startDate: string,
  endDate: string,
): void {
  const workbook = buildCustomerReportWorkbook(meters);

  if (workbook.SheetNames.length === 0) {
    throw new Error("No meter data available to export.");
  }

  const filename = buildCustomerReportFilename(customerName, startDate, endDate);
  XLSX.writeFile(workbook, filename);
}

/**
 * Builds a range summary workbook (one worksheet, one row per meter).
 */
export function buildRangeSummaryWorkbook(report: CustomerRangeReport): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();

  const rows = report.meters.map((meter) => ({
    "Customer": meter.customerName || "N/A",
    "Device Serial No": meter.deviceSerialNo,
    "Meter Serial No": meter.meterSerialNo || "N/A",
    "Start Date": meter.startDate,
    "Start Value (Sm³)": meter.startValue,
    "End Date": meter.endDate,
    "End Value (Sm³)": meter.endValue,
    "Consumption (Sm³)": meter.consumption,
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  autoSizeColumns(worksheet, rows);

  const sheetName = sanitizeSheetName(report.rangeLabel, "Summary", new Set<string>());
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  return workbook;
}

/**
 * Downloads the range summary report workbook.
 */
export function downloadRangeSummaryExcel(report: CustomerRangeReport): void {
  const workbook = buildRangeSummaryWorkbook(report);

  if (workbook.SheetNames.length === 0) {
    throw new Error("No range summary data available to export.");
  }

  const sanitizedCustomerName = report.customerName.replace(/[^a-z0-9]/gi, "_");
  const filename = `Range_Summary_${sanitizedCustomerName}_${report.startDate}_${report.endDate}.xlsx`;
  XLSX.writeFile(workbook, filename);
}