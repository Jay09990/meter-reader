import { db } from "@/lib/db";
import { AlarmType } from "@prisma/client";
import { notifyAlarmCreated } from "@/features/alarms/notify";
import { toIsoDate } from "@/lib/financial-calendar";

export async function checkGasOutOfRangeAlarm(
  deviceId: string,
  readingDate: Date,
  currentVb: number | undefined
): Promise<void> {
  if (currentVb === undefined || currentVb === null) {
    return;
  }

  // Get AlarmSettings
  const settings = await db.alarmSettings.findUnique({ where: { id: "singleton" } });
  const deviationPercent = settings?.gasDeviationPercent ?? 20;
  const deviationWindowDays = settings?.gasDeviationWindowDays ?? 7;

  // Get trailing N days of readings prior to current readingDate
  const windowStart = new Date(readingDate);
  windowStart.setUTCDate(windowStart.getUTCDate() - deviationWindowDays);

  // CHANGED: a device can now have multiple readings per day. Averaging
  // every raw row would let a chatty day (many pushes) skew the baseline
  // disproportionately vs. a normal once-a-day day. Fetch all rows in the
  // window, then collapse to one value per day (the latest push that
  // day) before averaging — same "latest-wins for display/derived-metric"
  // rule used everywhere else (features/devices/service.ts).
  const history = await db.reading.findMany({
    where: {
      deviceId,
      readingDate: {
        gte: windowStart,
        lt: readingDate,
      },
      correctedVolumeVb: {
        not: null,
      },
    },
    orderBy: [{ readingDate: "asc" }, { receivedAt: "desc" }],
    select: {
      readingDate: true,
      correctedVolumeVb: true,
    },
  });

  const latestPerDay = new Map<string, number>();
  for (const r of history) {
    const key = r.readingDate.toISOString().split("T")[0];
    if (!latestPerDay.has(key)) {
      latestPerDay.set(key, r.correctedVolumeVb as number); // first hit per
      // day = latest push for that day, given the sort order above
    }
  }

  if (latestPerDay.size < 3) {
    // Insufficient distinct days of history to establish a baseline —
    // note this is now a count of DAYS, not raw rows, so a device with
    // one day's worth of pushes (however many) still correctly skips.
    return;
  }

  const values = Array.from(latestPerDay.values());
  const sum = values.reduce((acc, val) => acc + val, 0);
  const average = sum / values.length;

  const deviationFactor = deviationPercent / 100;
  const lowerBound = average * (1 - deviationFactor);
  const upperBound = average * (1 + deviationFactor);

  if (currentVb < lowerBound || currentVb > upperBound) {
    const pctDiff = Math.abs(((currentVb - average) / average) * 100).toFixed(1);
    const direction = currentVb > average ? "above" : "below";
    const cause = `Corrected volume (${currentVb.toFixed(2)} Sm³) is ${pctDiff}% ${direction} the ${deviationWindowDays}-day average (${average.toFixed(2)} Sm³)`;

    const existing = await db.alarm.findUnique({ where: { deviceId_type_forDate: { deviceId, type: AlarmType.GAS_OUT_OF_RANGE, forDate: readingDate } } });
    if (existing) {
      await db.alarm.update({ where: { id: existing.id }, data: { gasValue: currentVb, averageValue: average, cause } });
    } else {
      const device = await db.device.findUnique({
        where: { id: deviceId },
        select: {
          deviceSerialNo: true,
          meterSerialNo: true,
          customer: { select: { name: true, ga: { select: { name: true } } } },
        },
      });
      await db.alarm.create({ data: { deviceId, type: AlarmType.GAS_OUT_OF_RANGE, severity: "WARNING", forDate: readingDate, gasValue: currentVb, averageValue: average, cause } });
      if (device) {
        await notifyAlarmCreated({
          deviceSerialNo: device.deviceSerialNo,
          type: AlarmType.GAS_OUT_OF_RANGE,
          severity: "WARNING",
          cause,
          forDate: readingDate,
          meterSerialNo: device.meterSerialNo,
          customerName: device.customer?.name,
          gaName: device.customer?.ga?.name,
          measuredValue: Number(currentVb.toFixed(2)),
          unit: "Sm³",
          thresholdValue: Number(average.toFixed(2)),
          thresholdDirection: direction,
        });
      }
    }
  }
}

/**
 * Fires a CRITICAL METER_FAILURE alarm when a meter's uncorrected volume
 * consumption diverges from its corrected volume consumption by >= 0.1 Sm³
 * in a single day.
 *
 * Formula (today's delta basis, not raw totalizers):
 *   correctedDelta   = currentVb − yesterdayVb
 *   uncorrectedDelta = currentVm − yesterdayVm
 *   if (uncorrectedDelta − correctedDelta) >= 0.1  →  METER_FAILURE
 *
 * Both deltas must be non-negative (skip on meter-reset / rollover readings).
 * If yesterday's boundary reading is missing for either volume, the check is
 * skipped — not enough data to compute a reliable delta.
 */
export async function checkMeterFailureAlarm(
  deviceId: string,
  readingDate: Date,
  currentVb: number | undefined | null,
  currentVm: number | undefined | null,
): Promise<void> {
  // Both volumes required to compare
  if (currentVb == null || currentVm == null) return;

  // Resolve yesterday's boundary date (same pattern as threshold-check.ts)
  const yesterday = new Date(readingDate.getTime() - 86_400_000);
  const yesterdayIso = toIsoDate(yesterday);

  // Fetch the latest reading on or before yesterday for each volume in one query
  const prevReading = await db.reading.findFirst({
    where: {
      deviceId,
      readingDate: { lte: yesterday },
      correctedVolumeVb: { not: null },
      uncorrectedVolumeVm: { not: null },
    },
    orderBy: [{ readingDate: "desc" }, { receivedAt: "desc" }],
    select: { correctedVolumeVb: true, uncorrectedVolumeVm: true },
  });

  if (!prevReading) return; // no baseline yet

  const prevVb = prevReading.correctedVolumeVb as number;
  const prevVm = prevReading.uncorrectedVolumeVm as number;

  const correctedDelta   = currentVb - prevVb;
  const uncorrectedDelta = currentVm - prevVm;

  // Skip on negative deltas (meter reset / replacement)
  if (correctedDelta < 0 || uncorrectedDelta < 0) return;

  const divergence = uncorrectedDelta - correctedDelta;

  if (divergence < 0.1) return; // within acceptable tolerance

  const cause =
    `Meter failure detected for ${yesterdayIso} → ${readingDate.toISOString().split("T")[0]}: ` +
    `uncorrected consumption (${uncorrectedDelta.toFixed(3)} m³) exceeds corrected consumption ` +
    `(${correctedDelta.toFixed(3)} Sm³) by ${divergence.toFixed(3)} — threshold is 0.1.`;

  const device = await db.device.findUnique({
    where: { id: deviceId },
    select: {
      deviceSerialNo: true,
      meterSerialNo: true,
      customer: { select: { name: true, ga: { select: { name: true } } } },
    },
  });

  const existing = await db.alarm.findUnique({
    where: { deviceId_type_forDate: { deviceId, type: AlarmType.METER_FAILURE, forDate: readingDate } },
  });

  if (existing) {
    // Update the divergence value on a re-push for the same date
    await db.alarm.update({
      where: { id: existing.id },
      data: { gasValue: divergence, averageValue: 0.1, cause, status: "OPEN" },
    });
    return;
  }

  await db.alarm.create({
    data: {
      deviceId,
      type: AlarmType.METER_FAILURE,
      severity: "CRITICAL",
      forDate: readingDate,
      gasValue: divergence,       // the actual divergence value
      averageValue: 0.1,          // the threshold
      cause,
      status: "OPEN",
    },
  });

  if (device) {
    await notifyAlarmCreated({
      deviceSerialNo: device.deviceSerialNo,
      type: AlarmType.METER_FAILURE,
      severity: "CRITICAL",
      cause,
      forDate: readingDate,
      meterSerialNo: device.meterSerialNo,
      customerName: device.customer?.name,
      gaName: device.customer?.ga?.name,
      measuredValue: Number(divergence.toFixed(3)),
      unit: "m³",
      thresholdValue: 0.1,
      thresholdDirection: "above",
    });
  }
}

