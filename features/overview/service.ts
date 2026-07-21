import { db } from "@/lib/db";

export async function getFleetOverview() {
  const now = new Date();
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const [totalDevices, reportedToday, openAlarms] = await Promise.all([
    db.device.count(),
    db.device.count({
      where: {
        lastSeenAt: {
          gte: startOfToday,
        },
      },
    }),
    db.alarm.count({
      where: {
        status: "OPEN",
      },
    }),
  ]);

  return {
    totalDevices,
    reportedToday,
    staleDevices: Math.max(0, totalDevices - reportedToday),
    openAlarms,
  };
}
