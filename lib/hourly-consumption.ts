// Normalizes meter hourly-consumption payloads for the API and detail chart.
export interface HourlyConsumptionPoint {
  hour: number;
  value: number;
  timestamp?: string;
  pressure?: number;
  temperature?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getPointHour(point: Record<string, unknown>, index: number): number {
  if (typeof point.timestamp === "string") {
    const time = /(?:T|\s)(\d{2}):\d{2}/.exec(point.timestamp);
    if (time) return Number(time[1]);
  }

  const rawHour = point.hour ?? point.h ?? index;
  return Number(rawHour);
}

function getPointValue(point: Record<string, unknown>): number {
  return Number(point.consumption ?? point.value ?? point.v ?? point.val);
}

function getOptionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export function normalizeHourlyConsumption(input: unknown): HourlyConsumptionPoint[] {
  const points: HourlyConsumptionPoint[] = [];

  if (Array.isArray(input)) {
    input.forEach((entry, index) => {
      const point = typeof entry === "number" ? { hour: index, value: entry } : entry;
      if (!isRecord(point)) return;

      const hour = getPointHour(point, index);
      const value = getPointValue(point);
      if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isFinite(value)) return;
      const pressure = getOptionalNumber(point.pressure ?? point.gasPressure);
      const temperature = getOptionalNumber(point.temperature ?? point.gasTemperature);

      points.push({
        hour,
        value,
        ...(typeof point.timestamp === "string" ? { timestamp: point.timestamp } : {}),
        ...(pressure !== undefined ? { pressure } : {}),
        ...(temperature !== undefined ? { temperature } : {}),
      });
    });

    return points;
  }

  if (!isRecord(input)) return points;

  Object.entries(input).forEach(([key, entry]) => {
    const keyHour = /\d+/.exec(key);
    const point = isRecord(entry) ? entry : { value: entry };
    const hour = Number(point.hour ?? point.h ?? (keyHour ? keyHour[0] : key));
    const value = getPointValue(point);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isFinite(value)) return;
    const pressure = getOptionalNumber(point.pressure ?? point.gasPressure);
    const temperature = getOptionalNumber(point.temperature ?? point.gasTemperature);

    points.push({
      hour,
      value,
      ...(typeof point.timestamp === "string" ? { timestamp: point.timestamp } : {}),
      ...(pressure !== undefined ? { pressure } : {}),
      ...(temperature !== undefined ? { temperature } : {}),
    });
  });

  return points;
}
