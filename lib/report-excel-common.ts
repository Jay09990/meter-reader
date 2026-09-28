// lib/report-excel-common.ts
// Pure utilities shared between server (daily email) and client (browser download)
// No DOM / browser dependencies — safe to import anywhere.

import type { MeterReportGroup, ReportReading } from "@/features/reports";

/** Groups a flat reading list into one bucket per device/meter. */
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

const EXCEL_SHEET_NAME_INVALID_CHARS = /[\\/?:*[\]]/g;
const MAX_SHEET_NAME_LENGTH = 31;

/**
 * Sanitizes a string for use as an Excel worksheet name: removes characters
 * Excel disallows, truncates to 31 chars, falls back to `fallback` when empty,
 * and de-duplicates against `usedNames`.
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
