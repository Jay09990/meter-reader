import { db } from "@/lib/db";
import { notifyAlarmCreated } from "./notify";

// Creates one missing-data alarm per non-reporting device/day and notifies on first creation.
export async function generateMissingDataAlarms(forDate?: Date): Promise<{ checked: number; alarmsFired: number }> {
  const targetDate = forDate ?? (() => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - 1);
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  })();
  const normalizedDate = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate()));
  const dateLabel = normalizedDate.toISOString().split("T")[0];
  const batchSize = 500;
  let skip = 0;
  let checked = 0;
  let alarmsFired = 0;

  while (true) {
    const devices = await db.device.findMany({
      skip,
      take: batchSize,
      select: {
        id: true,
        deviceSerialNo: true,
        meterSerialNo: true,
        customer: { select: { name: true, ga: { select: { name: true } } } },
      },
      orderBy: { id: "asc" },
    });
    if (!devices.length) break;
    const deviceIds = devices.map((device) => device.id);
    const reported = await db.reading.findMany({ where: { deviceId: { in: deviceIds }, readingDate: normalizedDate }, select: { deviceId: true } });
    const reportedIds = new Set(reported.map((reading) => reading.deviceId));

    for (const device of devices.filter((item) => !reportedIds.has(item.id))) {
      const existing = await db.alarm.findUnique({ where: { deviceId_type_forDate: { deviceId: device.id, type: "MISSING_DATA", forDate: normalizedDate } } });
      if (existing) continue;
      const cause = `No data received for ${dateLabel}`;
      await db.alarm.create({ data: { deviceId: device.id, type: "MISSING_DATA", severity: "CRITICAL", forDate: normalizedDate, cause, status: "OPEN" } });
      await notifyAlarmCreated({
        deviceSerialNo: device.deviceSerialNo,
        type: "MISSING_DATA",
        severity: "CRITICAL",
        cause,
        forDate: normalizedDate,
        meterSerialNo: device.meterSerialNo,
        customerName: device.customer?.name,
        gaName: device.customer?.ga?.name,
      });
      alarmsFired++;
    }
    checked += devices.length;
    skip += batchSize;
    if (devices.length < batchSize) break;
  }
  return { checked, alarmsFired };
}
