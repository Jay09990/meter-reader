// lib/report-excel.ts
import ExcelJS from "exceljs";
import type { HourlyConsumptionReport, MeterReportGroup, ReportMode, ReportReading } from "@/features/reports";
import { groupReadingsByMeter, sanitizeSheetName } from "@/lib/report-excel-common";

// ── Shared helpers (single source of truth lives in report-excel-common) ──

// Re-exported so existing `@/lib/report-excel` imports keep working.
export { groupReadingsByMeter, sanitizeSheetName };

// ── Constants ─────────────────────────────────────────────────────────────

const SOURCE_SEGMENT = "IBAFO";
// Used as sheet/group name when a meter has no customer name (matches the previous "Customer" fallback).
const UNKNOWN_CUSTOMER_NAME = "Customer";
const RANGE_REPORT_SHEET_NAME = "Range Report";
const MIN_COLUMN_WIDTH = 12;

// Customer header block layout (dateRange sheets): label spans columns 1-2, value spans 3-6.
const DETAIL_LABEL_END_COLUMN = 2;
const DETAIL_VALUE_START_COLUMN = 3;
const DETAIL_VALUE_END_COLUMN = 6;
const DETAIL_VALUE_CHARS_PER_LINE = 60; // rough estimate, used only to size the row height

const HEADER_FILL_COLOR = "FF1F3A5F";
const LABEL_FILL_COLOR = "FFE8EDF3";

// ── Column definitions ────────────────────────────────────────────────────

type CellValue = string | number;

interface RowContext {
  reading: ReportReading;
  srNo: number;
  streamNo: number;
}

interface ReportColumn {
  header: string;
  unit: string;
  align: "left" | "center";
  /** Customer-identifying columns. In dateRange mode they move into the sheet header block. */
  isCustomerDetail?: boolean;
  getValue: (context: RowContext) => CellValue;
}

function formatValue(value: number | null | undefined): CellValue {
  return value === null || value === undefined ? "-" : value;
}

/**
 * Formats an ISO timestamp as "YYYY-MM-DD HH:mm" using the UTC components embedded
 * in the string itself (no timezone conversion). This keeps the export deterministic
 * whether it runs in the browser (manual download) or on the server (daily email),
 * matching how the other date columns in this sheet are already built.
 */
function formatDateTime(isoString: string): string {
  const [datePart, timePart] = isoString.split("T");
  if (!datePart || !timePart) return "-";
  return `${datePart} ${timePart.slice(0, 5)}`;
}

// Column order mirrors the AMR reference template (AMR REPORT FORMAT.xlsx).
// "TOTAIZER" reproduces a typo in the reference report template.
const REPORT_COLUMNS: ReportColumn[] = [
  { header: "SR.NO", unit: "—", align: "center", getValue: ({ srNo }) => srNo },
  {
    header: "DATE & TIME", unit: "—", align: "center",
    getValue: ({ reading }) => formatDateTime(reading.readingDate),
  },
  {
    header: "NAME OF INDUSTRY", unit: "—", align: "left", isCustomerDetail: true,
    getValue: ({ reading }) => reading.customerName || "-",
  },
  {
    header: "CUSTOMER TYPE", unit: "—", align: "left", isCustomerDetail: true,
    getValue: ({ reading }) => reading.customerCategory || "-",
  },
  {
    header: "SOURCE/SEGMENT", unit: "—", align: "left", isCustomerDetail: true,
    getValue: () => SOURCE_SEGMENT,
  },
  {
    header: "METER SERIAL NO", unit: "—", align: "left",
    getValue: ({ reading }) => reading.meterSerialNo || reading.deviceSerialNo || "-",
  },
  { header: "STREAM NO", unit: "—", align: "center", getValue: ({ streamNo }) => streamNo },
  { header: "PRESSURE", unit: "Bar", align: "center", getValue: ({ reading }) => formatValue(reading.gasPressure) },
  { header: "TEMPERATURE", unit: "°C", align: "center", getValue: ({ reading }) => formatValue(reading.gasTemperature) },
  { header: "CORRECTION FACTOR", unit: "—", align: "center", getValue: ({ reading }) => formatValue(reading.correctionFactor) },
  { header: "CURRENT FLOWRATE (CORRECTED)", unit: "SCMH", align: "center", getValue: ({ reading }) => formatValue(reading.currentFlowRate) },
  { header: "CORRECTED VOLUME TOTALIZER", unit: "SCM", align: "center", getValue: ({ reading }) => formatValue(reading.correctedVolumeVb) },
  { header: "UNCORRECTED VOLUME TOTALIZER", unit: "m³", align: "center", getValue: ({ reading }) => formatValue(reading.uncorrectedVolumeVm) },
  { header: "PREVIOUS DAY UNCORRECTED", unit: "m³", align: "center", getValue: ({ reading }) => formatValue(reading.prevDayUncorrected) },
  { header: "PREVIOUS DAY CORRECTED", unit: "SCMD", align: "center", getValue: ({ reading }) => formatValue(reading.prevDayCorrected) },
  { header: "PREVIOUS DAY UNCORRECTED TOTALIZER", unit: "m³", align: "center", getValue: ({ reading }) => formatValue(reading.prevDayUncorrectedTotalizer) },
  { header: "PREVIOUS DAY CORRECTED TOTAIZER", unit: "SCM", align: "center", getValue: ({ reading }) => formatValue(reading.prevDayCorrectedTotalizer) },
  {
    header: "EVC BATTERY/BALANCE DAYS", unit: "%", align: "center",
    getValue: ({ reading }) => (reading.batteryLevel != null ? Math.round(reading.batteryLevel) : "-"),
  },
  { header: "ALARMS", unit: "—", align: "left", getValue: ({ reading }) => reading.alarms || "NORMAL" },
];

// Kept for backward compatibility with any other importer.
export const AMR_REPORT_HEADERS = REPORT_COLUMNS.map((column) => column.header);
export const AMR_REPORT_UNITS = REPORT_COLUMNS.map((column) => column.unit);

// ── Worksheet helpers ─────────────────────────────────────────────────────

function toDataRow(columns: ReportColumn[], context: RowContext): CellValue[] {
  return columns.map((column) => column.getValue(context));
}

function setColumnWidths(
  worksheet: ExcelJS.Worksheet,
  columns: ReportColumn[],
  dataRows: CellValue[][],
) {
  worksheet.columns = columns.map((column, columnIndex) => {
    const longestDataLength = dataRows.reduce(
      (longest, row) => Math.max(longest, String(row[columnIndex] ?? "").length),
      0,
    );
    const longest = Math.max(column.header.length, column.unit.length, longestDataLength);
    return { width: Math.max(longest + 4, MIN_COLUMN_WIDTH) };
  });
}

/** Writes the header row, the units row, then all data rows with styling. */
function writeTable(
  worksheet: ExcelJS.Worksheet,
  columns: ReportColumn[],
  dataRows: CellValue[][],
) {
  const headerRow = worksheet.addRow(columns.map((column) => column.header));
  const unitRow = worksheet.addRow(columns.map((column) => column.unit));
  const bodyRows = dataRows.map((values) => worksheet.addRow(values));

  for (const row of [headerRow, unitRow, ...bodyRows]) {
    row.eachCell((cell, columnNumber) => {
      cell.alignment = { horizontal: columns[columnNumber - 1].align, vertical: "middle" };
    });
  }
  headerRow.eachCell((cell) => {
    cell.font = { bold: true };
  });
  unitRow.eachCell((cell) => {
    cell.font = { italic: true, color: { argb: "FF666666" } };
  });
}

interface CustomerHeaderDetails {
  customerName: string;
  customerType: string;
  meterSerialNumbers: string[];
}

/** Large banner + customer detail rows placed above the table in each dateRange sheet. */
function addCustomerHeaderBlock(
  worksheet: ExcelJS.Worksheet,
  details: CustomerHeaderDetails,
  columnCount: number,
) {
  const titleRow = worksheet.addRow(["CUSTOMER DETAILS"]);
  worksheet.mergeCells(titleRow.number, 1, titleRow.number, columnCount);
  titleRow.height = 32;
  const titleCell = titleRow.getCell(1);
  titleCell.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL_COLOR } };
  titleCell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };

  const fields: Array<[label: string, value: string]> = [
    ["Customer Name", details.customerName],
    ["Customer Type", details.customerType],
    ["Source/Segment", SOURCE_SEGMENT],
    ["Meter Serial No(s)", details.meterSerialNumbers.join(", ")],
  ];
  const valueEndColumn = Math.min(DETAIL_VALUE_END_COLUMN, columnCount);

  for (const [label, value] of fields) {
    // Label goes in column 1, value in column 3 (columns 1-2 and 3-6 are merged below).
    const row = worksheet.addRow([label, "", value]);
    worksheet.mergeCells(row.number, 1, row.number, DETAIL_LABEL_END_COLUMN);
    worksheet.mergeCells(row.number, DETAIL_VALUE_START_COLUMN, row.number, valueEndColumn);

    // Merged cells don't auto-grow, so long serial lists need an explicit height.
    row.height = 20 * Math.max(1, Math.ceil(value.length / DETAIL_VALUE_CHARS_PER_LINE));

    const labelCell = row.getCell(1);
    labelCell.font = { bold: true };
    labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LABEL_FILL_COLOR } };
    labelCell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };

    row.getCell(DETAIL_VALUE_START_COLUMN).alignment = {
      horizontal: "left",
      vertical: "middle",
      wrapText: true,
    };
  }

  worksheet.addRow([]); // spacer between header block and table
}

// ── Data helpers ──────────────────────────────────────────────────────────

/** Groups meters by customer name, sorted alphabetically. MeterReportGroup has no customer field, so it comes from the readings. */
function groupMetersByCustomer(meters: MeterReportGroup[]): Array<[string, MeterReportGroup[]]> {
  const customerMap = new Map<string, MeterReportGroup[]>();

  for (const meter of meters) {
    const customerName = meter.readings[0]?.customerName?.trim() || UNKNOWN_CUSTOMER_NAME;
    const customerMeters = customerMap.get(customerName) ?? [];
    customerMeters.push(meter);
    customerMap.set(customerName, customerMeters);
  }

  return Array.from(customerMap.entries()).sort(([nameA], [nameB]) => nameA.localeCompare(nameB));
}

function getMeterLabel(meter: MeterReportGroup): string {
  return meter.meterSerialNo || meter.deviceSerialNo;
}

function getLatestReading(readings: ReportReading[]): ReportReading | undefined {
  return readings.reduce<ReportReading | undefined>(
    (latest, reading) =>
      !latest || new Date(reading.readingDate).getTime() > new Date(latest.readingDate).getTime()
        ? reading
        : latest,
    undefined,
  );
}

// ── Sheet builders ────────────────────────────────────────────────────────

/**
 * dateRange mode: one worksheet per customer.
 * Top of the sheet is a customer header block (name, type, source/segment, meter serials);
 * the table below omits those customer columns.
 * SR.NO is continuous across the whole sheet; STREAM NO restarts at 1 for each meter.
 */
function addDateRangeSheets(workbook: ExcelJS.Workbook, meters: MeterReportGroup[]) {
  const usedSheetNames = new Set<string>();
  const tableColumns = REPORT_COLUMNS.filter((column) => !column.isCustomerDetail);

  for (const [customerName, customerMeters] of groupMetersByCustomer(meters)) {
    const sortedMeters = [...customerMeters].sort((a, b) =>
      getMeterLabel(a).localeCompare(getMeterLabel(b)),
    );

    const dataRows: CellValue[][] = [];
    let firstReading: ReportReading | undefined;
    let srNo = 0;

    for (const [meterIndex, meter] of sortedMeters.entries()) {
      const meterReadings = [...meter.readings].sort(
        (a, b) => new Date(a.readingDate).getTime() - new Date(b.readingDate).getTime(),
      );
      meterReadings.forEach((reading) => {
        if (!firstReading) firstReading = reading;
        srNo++;
        dataRows.push(toDataRow(tableColumns, { reading, srNo, streamNo: meterIndex + 1 }));
      });
    }
    if (dataRows.length === 0 || !firstReading) continue;

    const worksheet = workbook.addWorksheet(
      sanitizeSheetName(customerName, "Customer", usedSheetNames),
    );
    setColumnWidths(worksheet, tableColumns, dataRows);
    addCustomerHeaderBlock(
      worksheet,
      {
        customerName,
        customerType: firstReading.customerCategory || "-",
        meterSerialNumbers: Array.from(new Set(sortedMeters.map(getMeterLabel))),
      },
      tableColumns.length,
    );
    writeTable(worksheet, tableColumns, dataRows);
  }
}

/**
 * rangeSelection mode: ONE worksheet for all customers.
 * One row per meter (latest reading, which the service already aggregates for the period).
 * SR.NO is global; STREAM NO restarts at 1 for each customer.
 */
function addRangeSelectionSheet(workbook: ExcelJS.Workbook, meters: MeterReportGroup[]) {
  const dataRows: CellValue[][] = [];
  let srNo = 0;

  for (const [, customerMeters] of groupMetersByCustomer(meters)) {
    let streamNo = 0;
    const sortedMeters = [...customerMeters].sort((a, b) =>
      getMeterLabel(a).localeCompare(getMeterLabel(b)),
    );

    for (const meter of sortedMeters) {
      const reading = getLatestReading(meter.readings);
      if (!reading) continue;

      srNo++;
      streamNo++;
      dataRows.push(toDataRow(REPORT_COLUMNS, { reading, srNo, streamNo }));
    }
  }

  if (dataRows.length === 0) return;

  const worksheet = workbook.addWorksheet(RANGE_REPORT_SHEET_NAME);
  setColumnWidths(worksheet, REPORT_COLUMNS, dataRows);
  writeTable(worksheet, REPORT_COLUMNS, dataRows);
}

// ── Workbook builder ──────────────────────────────────────────────────────

export function buildCustomerReportWorkbook(
  meters: MeterReportGroup[],
  mode?: ReportMode,
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();

  if (mode === "rangeSelection") {
    addRangeSelectionSheet(workbook, meters);
  } else {
    addDateRangeSheets(workbook, meters);
  }

  return workbook;
}

// ── Download helper ───────────────────────────────────────────────────────

function buildReportFilename(mode?: ReportMode, startDate?: string, endDate?: string): string {
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
  await downloadWorkbook(workbook, filename);
}

/** Exports the timestamp-filtered hourly rows shown in the Hourly report mode. */
export async function downloadHourlyConsumptionExcel(report: HourlyConsumptionReport): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Hourly Consumption");
  const headers = [
    "SR.NO",
    "CUSTOMER",
    "CUSTOMER TYPE",
    "GA",
    "DEVICE SERIAL NO",
    "METER SERIAL NO",
    "STREAM NO",
    "DATE & TIME",
    "PRESSURE (BAR)",
    "TEMPERATURE (°C)",
    "HOURLY CONSUMPTION (SCM)",
  ];

  worksheet.addRow([`Hourly Consumption Report: ${report.startDate} to ${report.endDate}`]);
  worksheet.mergeCells(1, 1, 1, headers.length);
  worksheet.addRow(headers);
  report.rows.forEach((row, index) => {
    worksheet.addRow([
      index + 1,
      row.customerName || "-",
      row.customerCategory || "-",
      row.gaName || "-",
      row.deviceSerialNo,
      row.meterSerialNo || "-",
      row.streamNo,
      row.timestamp.replace("T", " ").slice(0, 16),
      row.pressure ?? "-",
      row.temperature ?? "-",
      row.consumption,
    ]);
  });

  worksheet.columns = [
    { width: 10 },
    { width: 28 },
    { width: 20 },
    { width: 24 },
    { width: 24 },
    { width: 24 },
    { width: 12 },
    { width: 22 },
    { width: 18 },
    { width: 18 },
    { width: 28 },
  ];
  worksheet.getRow(1).font = { bold: true, size: 14 };
  worksheet.getRow(2).font = { bold: true, color: { argb: "FFFFFFFF" } };
  worksheet.getRow(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL_COLOR } };
  worksheet.autoFilter = { from: { row: 2, column: 1 }, to: { row: Math.max(2, report.rows.length + 2), column: headers.length } };
  worksheet.views = [{ state: "frozen", ySplit: 2 }];

  await downloadWorkbook(
    workbook,
    `Hourly_Consumption_Report_${report.startDate}_${report.endDate}.xlsx`,
  );
}

async function downloadWorkbook(workbook: ExcelJS.Workbook, filename: string): Promise<void> {
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
