/** Shared parsers/validators for device identity, location, and threshold fields. */

export const optionalNumber = (value: unknown): number | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function parseCoordinate(
  value: unknown,
  min: number,
  max: number,
): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const coordinate = Number(value);
  if (!Number.isFinite(coordinate) || coordinate < min || coordinate > max) {
    throw new Error(`Coordinate out of range: ${value}`);
  }
  return coordinate;
}

/** Empty string → null; undefined stays undefined (omit from update). */
export function optionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

export type ThresholdPairFields = {
  pressureUpperLimit?: number | null;
  pressureLowerLimit?: number | null;
  temperatureUpperLimit?: number | null;
  temperatureLowerLimit?: number | null;
  consumptionUpperLimit?: number | null;
  consumptionLowerLimit?: number | null;
};

/**
 * When both upper and lower are set for a metric, upper must be strictly greater
 * than lower. Returns an error message or null if valid.
 */
export function validateThresholdPairs(
  fields: ThresholdPairFields,
): string | null {
  const checks: Array<{ label: string; upper?: number | null; lower?: number | null }> = [
    {
      label: "Pressure",
      upper: fields.pressureUpperLimit,
      lower: fields.pressureLowerLimit,
    },
    {
      label: "Temperature",
      upper: fields.temperatureUpperLimit,
      lower: fields.temperatureLowerLimit,
    },
    {
      label: "Consumption",
      upper: fields.consumptionUpperLimit,
      lower: fields.consumptionLowerLimit,
    },
  ];

  for (const { label, upper, lower } of checks) {
    if (
      upper != null &&
      lower != null &&
      Number.isFinite(upper) &&
      Number.isFinite(lower) &&
      upper <= lower
    ) {
      return `${label} upper limit must be greater than lower limit.`;
    }
  }
  return null;
}

/** Client-side: parse optional numeric string inputs and validate upper > lower. */
export function parseAndValidateThresholdInputs(inputs: {
  pressureUpper: string;
  pressureLower: string;
  temperatureUpper: string;
  temperatureLower: string;
  consumptionUpper: string;
  consumptionLower: string;
  batteryLower: string;
}): { ok: true; values: Record<string, number | null> } | { ok: false; error: string } {
  const toNum = (raw: string): number | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return null;
    return n;
  };

  const values = {
    pressureUpperLimit: toNum(inputs.pressureUpper),
    pressureLowerLimit: toNum(inputs.pressureLower),
    temperatureUpperLimit: toNum(inputs.temperatureUpper),
    temperatureLowerLimit: toNum(inputs.temperatureLower),
    consumptionUpperLimit: toNum(inputs.consumptionUpper),
    consumptionLowerLimit: toNum(inputs.consumptionLower),
    batteryLowerLimit: toNum(inputs.batteryLower),
  };

  const pairError = validateThresholdPairs(values);
  if (pairError) return { ok: false, error: pairError };

  return { ok: true, values };
}
