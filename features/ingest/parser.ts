import { RawIngestPayload, ParsedReading } from "./types";

/**
 * Extracts a calendar date (year/month/day) directly from the front of an
 * ISO-ish date string via regex, bypassing `new Date(str)`'s local-time
 * interpretation entirely.
 *
 * Why: `new Date("2026-07-25 01:09:00")` (space instead of "T", no
 * timezone) is implementation-defined — V8 parses it as LOCAL time of
 * whatever machine runs the code. The exact same payload would then
 * normalize to a different UTC date depending on whether it's parsed on
 * a Vercel server (usually UTC) vs. a dev machine set to IST (+5:30),
 * where it can roll back to the previous day. That's non-deterministic
 * behavior we don't want anywhere near ingestion.
 *
 * This validates the YYYY-MM-DD portion before the full timestamp is parsed.
 */
function extractCalendarDateUTC(str: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(str.trim());
  if (!match) return null;

  const [, yearStr, monthStr, dayStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  const date = new Date(Date.UTC(year, month - 1, day));
  // Guard against nonsense like "2026-13-40" silently rolling over into a
  // different month/year via Date's own overflow behavior.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

/** Parse device timestamps deterministically, treating timezone-less values as UTC. */
function parseReadingTimestamp(value: string): Date | null {
  const trimmed = value.trim();
  if (!extractCalendarDateUTC(trimmed)) return null;

  // Device payloads commonly omit a timezone; interpreting those as local time
  // would make the stored reading moment depend on the server's configured zone.
  const normalized = trimmed.includes(" ") && !trimmed.includes("T")
    ? trimmed.replace(" ", "T")
    : trimmed;
  const timestamp = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized)
    ? new Date(normalized)
    : new Date(`${normalized}Z`);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp;
}

export function parseIngestPayload(body: unknown): ParsedReading {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Invalid payload: Body must be a JSON object");
  }

  // Support wrapped payload { data: { ... } } as requested, 
  // but fall back to flat payload for backward compatibility.
  const payload = (body as { data?: RawIngestPayload }).data && 
                  typeof (body as { data?: RawIngestPayload }).data === "object" && 
                  !Array.isArray((body as { data?: RawIngestPayload }).data)
    ? (body as { data: RawIngestPayload }).data
    : body as RawIngestPayload;

    console.log("Received payload:", body);

    console.log("Parsing payload:", JSON.stringify(payload));

  if (!payload.deviceSerialNo || typeof payload.deviceSerialNo !== "string" || !payload.deviceSerialNo.trim()) {
    throw new Error("Invalid payload: Missing or empty deviceSerialNo");
  }

  // Prefer the payload's measurement timestamp, then its legacy timestamp,
  // and finally today's UTC date for older payloads without either field.
  let normalizedDate: Date | null = null;

  if (payload.readingDate && typeof payload.readingDate === "string") {
    normalizedDate = parseReadingTimestamp(payload.readingDate);
  }

  if (!normalizedDate && payload.timestamp && typeof payload.timestamp === "string") {
    normalizedDate = parseReadingTimestamp(payload.timestamp);
  }

  if (!normalizedDate) {
    const now = new Date();
    normalizedDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }
  
  return {
    deviceSerialNo: payload.deviceSerialNo.trim(),
    meterSerialNo: typeof payload.meterSerialNo === "string" ? payload.meterSerialNo : undefined,
    meterSize: typeof payload.meterSize === "string" ? payload.meterSize : undefined,
    firmwareVersion: typeof payload.firmwareVersion === "string" ? payload.firmwareVersion : undefined,
    hardwareVersion: typeof payload.hardwareVersion === "string" ? payload.hardwareVersion : undefined,
    deviceModel: typeof payload.deviceModel === "string" ? payload.deviceModel : undefined,
    configurationVersion: typeof payload.configurationVersion === "string" ? payload.configurationVersion : undefined,
    siteLabel: typeof payload.siteLabel === "string" ? payload.siteLabel : undefined,
    stationLabel: typeof payload.stationLabel === "string" ? payload.stationLabel : undefined,
    readingDate: normalizedDate,
    correctedVolumeVb: typeof payload.volume?.correctedVb === "number" ? payload.volume.correctedVb : undefined,
    uncorrectedVolumeVm: typeof payload.volume?.uncorrectedVm === "number" ? payload.volume.uncorrectedVm : undefined,
    gasPressure: typeof payload.pressure?.value === "number" ? payload.pressure.value : undefined,
    pressureMax: typeof payload.pressure?.max === "number" ? payload.pressure.max : undefined,
    pressureMin: typeof payload.pressure?.min === "number" ? payload.pressure.min : undefined,
    gasTemperature: typeof payload.temperature?.value === "number" ? payload.temperature.value : undefined,
    temperatureMax: typeof payload.temperature?.max === "number" ? payload.temperature.max : undefined,
    temperatureMin: typeof payload.temperature?.min === "number" ? payload.temperature.min : undefined,
    compressibilityZ: (typeof payload.gasProperties?.compressibilityZ === "number" && payload.gasProperties.compressibilityZ > 0)
      ? payload.gasProperties.compressibilityZ
      : (typeof payload.volume?.correctedVb === "number" && typeof payload.volume?.uncorrectedVm === "number" && payload.volume.uncorrectedVm > 0)
        ? payload.volume.correctedVb / payload.volume.uncorrectedVm
        : undefined,
    compressibilityFpv: typeof payload.gasProperties?.compressibilityFpv === "number" ? payload.gasProperties.compressibilityFpv : undefined,
    correctionFactorC: (typeof payload.gasProperties?.correctionFactorC === "number" && payload.gasProperties.correctionFactorC > 0)
      ? payload.gasProperties.correctionFactorC
      : (typeof payload.volume?.correctedVb === "number" && typeof payload.volume?.uncorrectedVm === "number" && payload.volume.uncorrectedVm > 0)
        ? payload.volume.correctedVb / payload.volume.uncorrectedVm
        : undefined,
    gasDensity: typeof payload.gasProperties?.density === "number" ? payload.gasProperties.density : undefined,
    batteryLevel: typeof payload.batteryLevel === "number" ? payload.batteryLevel : undefined,
    currentFlowRate: typeof payload.currentFlowRate === "number" ? payload.currentFlowRate : undefined,
    hourlyConsumption:
      Array.isArray(payload.hourlyConsumption) ? payload.hourlyConsumption :
      Array.isArray((payload as any).hourlyData) ? (payload as any).hourlyData :
      Array.isArray((payload as any).hourly_consumption) ? (payload as any).hourly_consumption :
      Array.isArray((payload as any).hourly) ? (payload as any).hourly :
      Array.isArray((payload as any).hourlyVolumes) ? (payload as any).hourlyVolumes :
      Array.isArray((payload.volume as any)?.hourly) ? (payload.volume as any).hourly :
      (payload.hourlyConsumption && typeof payload.hourlyConsumption === "object") ? payload.hourlyConsumption :
      undefined,
    rawPayload: payload as Record<string, unknown>,
  };
}
