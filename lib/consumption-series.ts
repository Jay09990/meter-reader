/**
 * lib/consumption-series.ts
 *
 * Shared bucket-builder, types, and x-axis tick picker for delta-based
 * consumption charts. Used by both fleet-wide (Overview) and per-device
 * (Meter Detail, Map popup) paths.
 *
 * A "consumption" value is ALWAYS a delta:
 *   value = latestReading(endDate).correctedVolumeVb
 *         − latestReading(startDate).correctedVolumeVb
 *
 * Negative deltas are marked `suspect` (meter reset / replacement).
 */

import {
  toIsoDate,
  getMonthStart,
  getMonthEnd,
  addMonths,
  getQuarterStart,
  getQuarterEnd,
  getCurrentQuarterStart,
  formatDayLabel,
  formatMonthLabel,
} from "./financial-calendar";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ConsumptionMode = "daily" | "monthly" | "quarterly";

export interface ConsumptionBucket {
  /** Display label — "14-Aug" / "Aug-25" / "Apr-25" */
  label: string;
  /** ISO date (YYYY-MM-DD): the period's start boundary */
  startDate: string;
  /** ISO date (YYYY-MM-DD): the period's end boundary (today for current partial bucket) */
  endDate: string;
  /**
   * Delta value in Sm³, or null if suspect (negative) or data missing on either
   * side of this bucket.
   */
  value: number | null;
  /** true → endReading < startReading (meter reset). Render as zero bar + warning. */
  suspect: boolean;
}

/** A raw boundary-reading lookup result, keyed by boundary ISO date. */
export type ReadingAtDate = number | null;

/**
 * A function that resolves boundary readings for one or many devices.
 * Called once per unique boundary date by the bucket builders below.
 */
export type BoundaryResolver = (isoDate: string) => Promise<ReadingAtDate>;

// ─── Bucket definition builders ──────────────────────────────────────────────

interface BucketSpec {
  label: string;
  startDate: string; // ISO
  endDate: string;   // ISO
}

/** Build 30 daily bucket specs trailing from `today` (inclusive). */
function buildDailySpecs(today: Date): BucketSpec[] {
  const specs: BucketSpec[] = [];
  for (let i = 29; i >= 0; i--) {
    const dayEnd = new Date(Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate() - i,
    ));
    const dayStart = new Date(dayEnd.getTime() - 86_400_000); // previous day
    specs.push({
      label: formatDayLabel(dayEnd),
      startDate: toIsoDate(dayStart),
      endDate: toIsoDate(dayEnd),
    });
  }
  return specs;
}

/** Build 13 monthly bucket specs: trailing calendar months incl. current month. */
function buildMonthlySpecs(today: Date): BucketSpec[] {
  const specs: BucketSpec[] = [];
  const todayIso = toIsoDate(today);

  for (let i = 12; i >= 0; i--) {
    const monthStart = addMonths(getMonthStart(today), -i);
    const monthEnd = getMonthEnd(monthStart);
    const isCurrentMonth = i === 0;

    specs.push({
      label: formatMonthLabel(monthStart),
      startDate: toIsoDate(monthStart),
      // Current (partial) month: use today as end boundary
      endDate: isCurrentMonth ? todayIso : toIsoDate(monthEnd),
    });
  }
  return specs;
}

/** Build 5 FY-quarter bucket specs: trailing quarters incl. current quarter. */
function buildQuarterlySpecs(today: Date): BucketSpec[] {
  const specs: BucketSpec[] = [];
  const todayIso = toIsoDate(today);
  const currentQStart = getCurrentQuarterStart(today);

  for (let i = 4; i >= 0; i--) {
    const qStart = getQuarterStart(today, i);
    const isCurrentQuarter = toIsoDate(qStart) === toIsoDate(currentQStart);

    specs.push({
      label: formatMonthLabel(qStart), // use quarter's start month as label
      startDate: toIsoDate(qStart),
      endDate: isCurrentQuarter ? todayIso : toIsoDate(getQuarterEnd(qStart)),
    });
  }
  return specs;
}

export function buildBucketSpecs(mode: ConsumptionMode, today: Date = new Date()): BucketSpec[] {
  switch (mode) {
    case "daily":     return buildDailySpecs(today);
    case "monthly":   return buildMonthlySpecs(today);
    case "quarterly": return buildQuarterlySpecs(today);
  }
}

// ─── Bucket value computation ─────────────────────────────────────────────────

/**
 * Compute a single ConsumptionBucket from pre-resolved boundary readings.
 * Handles null readings and negative deltas uniformly.
 */
export function computeBucket(
  spec: BucketSpec,
  startReading: number | null,
  endReading: number | null,
): ConsumptionBucket {
  if (startReading == null || endReading == null) {
    return { ...spec, value: null, suspect: false };
  }

  const delta = endReading - startReading;

  if (delta < 0) {
    // Negative delta = meter reset / replacement
    return { ...spec, value: null, suspect: true };
  }

  return { ...spec, value: delta, suspect: false };
}

// ─── Unique boundary dates ────────────────────────────────────────────────────

/**
 * Extract every unique ISO boundary date from a list of bucket specs
 * (both startDate and endDate for each bucket).
 * The resolver is called once per unique date, not once per bucket.
 */
export function uniqueBoundaryDates(specs: BucketSpec[]): string[] {
  const seen = new Set<string>();
  for (const s of specs) {
    seen.add(s.startDate);
    seen.add(s.endDate);
  }
  return [...seen];
}

// ─── Series builder (single-scope: one BoundaryResolver) ─────────────────────

/**
 * Build the full ConsumptionBucket array for a given mode and resolver.
 *
 * The resolver is called once per unique boundary date.
 * For fleet-wide use, pass a resolver that returns the fleet-wide SUM;
 * for per-device use, pass a resolver that returns one device's reading.
 */
export async function buildConsumptionSeries(
  mode: ConsumptionMode,
  resolver: BoundaryResolver,
  today: Date = new Date(),
): Promise<ConsumptionBucket[]> {
  const specs = buildBucketSpecs(mode, today);
  const boundaries = uniqueBoundaryDates(specs);

  // Resolve all boundaries in parallel
  const readings = new Map<string, number | null>();
  await Promise.all(
    boundaries.map(async (iso) => {
      readings.set(iso, await resolver(iso));
    }),
  );

  return specs.map((spec) =>
    computeBucket(
      spec,
      readings.get(spec.startDate) ?? null,
      readings.get(spec.endDate) ?? null,
    ),
  );
}

// ─── X-axis tick picker ───────────────────────────────────────────────────────

/**
 * Pick `count` evenly-spaced labels from `labels` (always including first and last).
 * Pass the result as the Recharts XAxis `ticks` prop to get predictable sparse labels
 * regardless of chart width.
 *
 * @example
 *   pickTicks(["1-Aug", ..., "30-Aug"], 4)
 *   // → ["1-Aug", "11-Aug", "20-Aug", "30-Aug"]
 */
export function pickTicks(labels: string[], count: number): string[] {
  if (labels.length === 0) return [];
  if (labels.length <= count) return labels;
  const step = (labels.length - 1) / (count - 1);
  return Array.from({ length: count }, (_, i) => labels[Math.round(i * step)]);
}

/** Returns the appropriate tick count for a given mode. */
export function tickCountForMode(mode: ConsumptionMode): number {
  switch (mode) {
    case "daily":     return 4;
    case "monthly":   return 6;
    case "quarterly": return 5; // show all 5
  }
}
