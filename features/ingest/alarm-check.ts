import { db } from "@/lib/db";
import { AlarmType } from "@prisma/client";
import { notifyAlarmCreated } from "@/features/alarms/notify";

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
      const device = await db.device.findUnique({ where: { id: deviceId }, select: { deviceSerialNo: true } });
      await db.alarm.create({ data: { deviceId, type: AlarmType.GAS_OUT_OF_RANGE, severity: "WARNING", forDate: readingDate, gasValue: currentVb, averageValue: average, cause } });
      if (device) await notifyAlarmCreated({ deviceSerialNo: device.deviceSerialNo, type: AlarmType.GAS_OUT_OF_RANGE, severity: "WARNING", cause, forDate: readingDate });
    }
  }
}
