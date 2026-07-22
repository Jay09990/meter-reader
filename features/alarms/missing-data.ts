import { db } from "@/lib/db";

/**
 * generateMissingDataAlarms — DATAFLOW.md §6.1
 *
 * Walks all Device rows. For each device that has no Reading for `forDate`,
 * upserts an Alarm (MISSING_DATA). Idempotent: @@unique([deviceId, type, forDate])
 * prevents duplicates.
 *
 * @param forDate  The day to check (defaults to yesterday UTC, since the push
 *                 window for a day is assumed to close before this job runs).
 * @returns        { checked, alarmsFired }
 */
export async function generateMissingDataAlarms(forDate?: Date): Promise<{
  checked: number;
  alarmsFired: number;
}> {
  // Default: yesterday (the last complete push window)
  const targetDate =
    forDate ??
    (() => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - 1);
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    })();

  const normalizedDate = new Date(
    Date.UTC(
      targetDate.getUTCFullYear(),
      targetDate.getUTCMonth(),
      targetDate.getUTCDate()
    )
  );

  const dateLabel = normalizedDate.toISOString().split("T")[0];

  // Fetch all devices in batches of 500 to avoid loading 20k at once
  const BATCH = 500;
  let skip = 0;
  let checked = 0;
  let alarmsFired = 0;

  while (true) {
    const devices = await db.device.findMany({
      skip,
      take: BATCH,
      select: { id: true },
      orderBy: { id: "asc" },
    });

    if (devices.length === 0) break;

    // Find which of these devices DO have a reading for the target date
    const deviceIds = devices.map((d) => d.id);
    const reported = await db.reading.findMany({
      where: {
        deviceId: { in: deviceIds },
        readingDate: normalizedDate,
      },
      select: { deviceId: true },
    });
    const reportedSet = new Set(reported.map((r) => r.deviceId));

    // Upsert alarms for the ones that didn't report
    const missing = deviceIds.filter((did) => !reportedSet.has(did));

    for (const deviceId of missing) {
      await db.alarm.upsert({
        where: {
          deviceId_type_forDate: {
            deviceId,
            type: "MISSING_DATA",
            forDate: normalizedDate,
          },
        },
        create: {
          deviceId,
          type: "MISSING_DATA",
          severity: "CRITICAL",
          forDate: normalizedDate,
          cause: `No data received for ${dateLabel}`,
          status: "OPEN",
        },
        update: {}, // already exists — don't overwrite status if it was manually resolved
      });
      alarmsFired++;
    }

    checked += devices.length;
    skip += BATCH;

    if (devices.length < BATCH) break;
  }

  return { checked, alarmsFired };
}
