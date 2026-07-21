import { db } from "@/lib/db";
import { AlarmType } from "@prisma/client";

export async function checkGasOutOfRangeAlarm(
  deviceId: string,
  readingDate: Date,
  currentVb: number | undefined
): Promise<void> {
  if (currentVb === undefined || currentVb === null) {
    return;
  }

  // Get trailing 7 days of readings prior to current readingDate
  const sevenDaysAgo = new Date(readingDate);
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);

  const history = await db.reading.findMany({
    where: {
      deviceId,
      readingDate: {
        gte: sevenDaysAgo,
        lt: readingDate,
      },
      correctedVolumeVb: {
        not: null,
      },
    },
    select: {
      correctedVolumeVb: true,
    },
  });

  if (history.length < 3) {
    // Insufficient history to establish a baseline
    return;
  }

  const values = history.map((r) => r.correctedVolumeVb as number);
  const sum = values.reduce((acc, val) => acc + val, 0);
  const average = sum / values.length;

  const lowerBound = average * 0.8;
  const upperBound = average * 1.2;

  if (currentVb < lowerBound || currentVb > upperBound) {
    const pctDiff = Math.abs(((currentVb - average) / average) * 100).toFixed(1);
    const direction = currentVb > average ? "above" : "below";
    const cause = `Corrected volume (${currentVb.toFixed(2)} Sm³) is ${pctDiff}% ${direction} the 7-day average (${average.toFixed(2)} Sm³)`;

    await db.alarm.upsert({
      where: {
        deviceId_type_forDate: {
          deviceId,
          type: AlarmType.GAS_OUT_OF_RANGE,
          forDate: readingDate,
        },
      },
      create: {
        deviceId,
        type: AlarmType.GAS_OUT_OF_RANGE,
        forDate: readingDate,
        gasValue: currentVb,
        averageValue: average,
        cause,
      },
      update: {
        gasValue: currentVb,
        averageValue: average,
        cause,
      },
    });
  }
}
