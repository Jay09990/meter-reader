import { RawIngestPayload, ParsedReading } from "./types";

export function parseIngestPayload(body: unknown): ParsedReading {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Invalid payload: Body must be a JSON object");
  }

  const payload = body as RawIngestPayload;

  if (!payload.deviceSerialNo || typeof payload.deviceSerialNo !== "string" || !payload.deviceSerialNo.trim()) {
    throw new Error("Invalid payload: Missing or empty deviceSerialNo");
  }

  // Determine reading date
  let dateObj: Date;
  if (payload.readingDate && typeof payload.readingDate === "string") {
    dateObj = new Date(payload.readingDate);
  } else if (payload.timestamp && typeof payload.timestamp === "string") {
    dateObj = new Date(payload.timestamp);
  } else {
    dateObj = new Date();
  }

  if (isNaN(dateObj.getTime())) {
    dateObj = new Date();
  }

  // Normalize to start of day (UTC)
  const normalizedDate = new Date(Date.UTC(dateObj.getUTCFullYear(), dateObj.getUTCMonth(), dateObj.getUTCDate()));

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
    compressibilityZ: typeof payload.gasProperties?.compressibilityZ === "number" ? payload.gasProperties.compressibilityZ : undefined,
    compressibilityFpv: typeof payload.gasProperties?.compressibilityFpv === "number" ? payload.gasProperties.compressibilityFpv : undefined,
    correctionFactorC: typeof payload.gasProperties?.correctionFactorC === "number" ? payload.gasProperties.correctionFactorC : undefined,
    gasDensity: typeof payload.gasProperties?.density === "number" ? payload.gasProperties.density : undefined,
    hourlyConsumption: Array.isArray(payload.hourlyConsumption) ? payload.hourlyConsumption : undefined,
    rawPayload: payload as Record<string, unknown>,
  };
}
