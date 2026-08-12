import * as XLSX from "xlsx";
import type { MeterReportGroup, ReportReading } from "@/features/reports";

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

function toExcelRow(row: ReportReading) {
  return {
    "Reading Date": new Date(row.readingDate).toLocaleString(),
    "Device Serial No": row.deviceSerialNo,
    "Meter Serial No": row.meterSerialNo || "N/A",
    "Corrected Volume (Sm³)": row.correctedVolumeVb,
    "Uncorrected Volume (m³)": row.uncorrectedVolumeVm,
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
      const worksheet = XLSX.utils.json_to_sheet(meter.readings.map(toExcelRow));
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