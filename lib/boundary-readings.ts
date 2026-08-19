/**
 * lib/boundary-readings.ts
 *
 * Efficient DB helpers for resolving "latest correctedVolumeVb on or before
 * a given date" without per-device loops.
 *
 * Fleet-wide: one $queryRaw with DISTINCT ON per boundary date (PostgreSQL).
 * Single-device: a plain findFirst per boundary (fine at ≤14 queries / device).
 */

import { db } from "./db";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DistinctOnRow {
  deviceId: string;
  correctedVolumeVb: number | null;
}

// ─── Fleet-wide resolver ──────────────────────────────────────────────────────

/**
 * For a given boundary date, return a Map<deviceId → correctedVolumeVb> using
 * a single PostgreSQL `DISTINCT ON` query.
 *
 * This is the most recent reading with readingDate <= boundaryDate for every
 * device that has at least one qualifying reading.
 *
 * Expected query plan: index scan on (deviceId, readingDate DESC) — add a
 * composite index on `Reading(deviceId, readingDate, receivedAt)` if slow.
 */
export async function getFleetBoundaryReadings(
  isoDate: string,
): Promise<Map<string, number>> {
  const rows = await db.$queryRaw<DistinctOnRow[]>`
    SELECT DISTINCT ON ("deviceId")
           "deviceId",
           "correctedVolumeVb"
    FROM   "Reading"
    WHERE  "readingDate" <= ${isoDate}::date
      AND  "correctedVolumeVb" IS NOT NULL
    ORDER  BY "deviceId", "readingDate" DESC, "receivedAt" DESC
  `;

  const result = new Map<string, number>();
  for (const row of rows) {
    if (row.correctedVolumeVb != null) {
      result.set(row.deviceId, Number(row.correctedVolumeVb));
    }
  }
  return result;
}

/**
 * Build a fleet-wide BoundaryResolver suitable for `buildConsumptionSeries`.
 *
 * The resolver is called once per unique boundary date. It sums correctedVolumeVb
 * across all devices that have a reading on or before that date.
 *
 * Devices missing a reading on either side of a bucket are excluded from that
 * bucket's delta (not treated as 0), so the sum only reflects devices with data
 * on BOTH sides. This is handled by the caller in `getFleetConsumptionSeries`
 * which computes per-device deltas first.
 *
 * For the per-bucket fleet SUM approach, we cache the full Map per boundary date
 * so that multiple buckets sharing the same boundary only do one query.
 */
export function makeFleetBoundaryResolver(): (isoDate: string) => Promise<number | null> {
  const cache = new Map<string, Map<string, number>>();

  return async (isoDate: string) => {
    if (!cache.has(isoDate)) {
      cache.set(isoDate, await getFleetBoundaryReadings(isoDate));
    }
    // Sum all device values at this boundary
    const map = cache.get(isoDate)!;
    if (map.size === 0) return null;
    let total = 0;
    for (const v of map.values()) total += v;
    return total;
  };
}

/**
 * Build a per-device-delta fleet resolver.
 *
 * Unlike the naive "sum of all readings at endDate minus sum at startDate",
 * this resolver returns a pre-built function that, given a boundary ISO date,
 * resolves all device readings. The consumption series builder then calls it for
 * each bucket's startDate and endDate independently — but `buildFleetDeltaResolver`
 * handles the cross-bucket device exclusion (devices missing either side = skip).
 *
 * Usage in getFleetConsumptionSeries:
 *   const allMaps = await buildFleetBoundaryMaps(boundaries);
 *   // For each bucket: sum per-device deltas where both sides exist.
 */
export async function buildFleetBoundaryMaps(
  isoDateList: string[],
): Promise<Map<string, Map<string, number>>> {
  const result = new Map<string, Map<string, number>>();
  // Run all boundary queries in parallel (one per unique date)
  await Promise.all(
    isoDateList.map(async (iso) => {
      result.set(iso, await getFleetBoundaryReadings(iso));
    }),
  );
  return result;
}

// ─── Single-device resolver ───────────────────────────────────────────────────

/**
 * For a single device, return its correctedVolumeVb from the latest reading
 * with readingDate <= isoDate. Returns null if no qualifying reading exists.
 *
 * Using findFirst is fine here — at most ~31 calls per device (daily 30-bucket
 * series needs 31 boundary dates), well within Prisma/Postgres limits.
 */
export async function getDeviceBoundaryReading(
  deviceId: string,
  isoDate: string,
): Promise<number | null> {
  const reading = await db.reading.findFirst({
    where: {
      deviceId,
      readingDate: { lte: new Date(isoDate) },
      correctedVolumeVb: { not: null },
    },
    orderBy: [
      { readingDate: "desc" },
      { receivedAt: "desc" },
    ],
    select: { correctedVolumeVb: true },
  });
  return reading?.correctedVolumeVb ?? null;
}

/**
 * Build a BoundaryResolver for a single device (with caching to avoid
 * duplicate queries when the same date appears as both a startDate and endDate).
 */
export function makeDeviceBoundaryResolver(
  deviceId: string,
): (isoDate: string) => Promise<number | null> {
  const cache = new Map<string, number | null>();

  return async (isoDate: string) => {
    if (!cache.has(isoDate)) {
      cache.set(isoDate, await getDeviceBoundaryReading(deviceId, isoDate));
    }
    return cache.get(isoDate)!;
  };
}
