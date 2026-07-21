export interface RawIngestPayload {
  deviceSerialNo: string;
  meterSerialNo?: string;
  meterSize?: string;
  firmwareVersion?: string;
  hardwareVersion?: string;
  deviceModel?: string;
  configurationVersion?: string;
  timestamp?: string;
  readingDate?: string;
  siteLabel?: string;
  stationLabel?: string;
  volume?: {
    correctedVb?: number;
    uncorrectedVm?: number;
  };
  pressure?: {
    value?: number;
    max?: number;
    min?: number;
    unit?: string;
  };
  temperature?: {
    value?: number;
    max?: number;
    min?: number;
    unit?: string;
  };
  gasProperties?: {
    compressibilityZ?: number;
    compressibilityFpv?: number;
    correctionFactorC?: number;
    density?: number;
  };
  hourlyConsumption?: Array<{ hour: number; value: number }>;
  [key: string]: unknown;
}

export interface ParsedReading {
  deviceSerialNo: string;
  meterSerialNo?: string;
  meterSize?: string;
  firmwareVersion?: string;
  hardwareVersion?: string;
  deviceModel?: string;
  configurationVersion?: string;
  siteLabel?: string;
  stationLabel?: string;
  readingDate: Date;
  correctedVolumeVb?: number;
  uncorrectedVolumeVm?: number;
  gasPressure?: number;
  pressureMax?: number;
  pressureMin?: number;
  gasTemperature?: number;
  temperatureMax?: number;
  temperatureMin?: number;
  compressibilityZ?: number;
  compressibilityFpv?: number;
  correctionFactorC?: number;
  gasDensity?: number;
  hourlyConsumption?: unknown;
  rawPayload: Record<string, unknown>;
}
