import { AlarmStatus, CustomerCategory } from "@prisma/client";
import { db } from "../../lib/db";
import { computeDeviceStatus } from "../../lib/device-status";

const CATEGORY_ORDER = ["INDUSTRIAL", "COMMERCIAL", "RESIDENTIAL", "BULK"] as const;
const MAX_SUSPECT_VALUE = 1_000_000;

function getUtcMonthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function getMonthLabel(date: Date) {
  return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][date.getUTCMonth()];
}

export function buildMonthlyConsumptionSeries(
  monthlyReadings: Array<{ month: string; value: number }>,
  asOf: Date = new Date(),
) {
  const buckets = new Map(monthlyReadings.map((item) => [item.month, item.value]));
  const series = [] as Array<{ month: string; value: number }>;

  for (let index = 6; index >= 0; index -= 1) {
    const monthDate = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - index, 1));
    const monthKey = getUtcMonthKey(monthDate);
    series.push({
      month: getMonthLabel(monthDate),
      value: buckets.get(monthKey) ?? 0,
    });
  }

  return series;
}

export function buildCategoryTotals(
  values: Array<{ category: string; totalVolume: number }>,
) {
  const totals = new Map<string, number>();

  CATEGORY_ORDER.forEach((category) => totals.set(category, 0));

  values.forEach((item) => {
    const category = item.category as (typeof CATEGORY_ORDER)[number];
    if (totals.has(category)) {
      totals.set(category, (totals.get(category) ?? 0) + item.totalVolume);
    }
  });

  return CATEGORY_ORDER.map((category) => ({
    category,
    totalVolume: totals.get(category) ?? 0,
  }));
}

export async function getFleetOverview() {
  const now = new Date();
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [totalDevices, reportedToday, offlineDevices, alarmsBySeverity] = await Promise.all([
    db.device.count(),
    db.device.count({
      where: { lastSeenAt: { gte: startOfToday } },
    }),
    db.device.count({
      where: {
        OR: [
          { lastSeenAt: null },
          { lastSeenAt: { lt: yesterday } },
        ],
      },
    }),
    db.alarm.groupBy({
      by: ["severity"],
      where: { status: AlarmStatus.OPEN },
      _count: { _all: true },
    }),
  ]);

  let criticalAlarms = 0;
  let warningAlarms = 0;

  alarmsBySeverity.forEach((alarm) => {
    if (alarm.severity === "CRITICAL") criticalAlarms = alarm._count._all;
    if (alarm.severity === "WARNING") warningAlarms = alarm._count._all;
  });

  return {
    totalDevices,
    reportedToday,
    staleDevices: Math.max(0, totalDevices - reportedToday),
    offlineDevices,
    openAlarms: criticalAlarms + warningAlarms,
    criticalAlarms,
    warningAlarms,
  };
}

export async function getFleetAnalytics() {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [openAlertCount, allReadings, devices] = await Promise.all([
    db.alarm.count({ where: { status: AlarmStatus.OPEN } }),
    db.reading.findMany({
      select: {
        readingDate: true,
        correctedVolumeVb: true,
      },
      where: { correctedVolumeVb: { not: null } },
    }),
    db.device.findMany({
      select: {
        id: true,
        deviceSerialNo: true,
        customerId: true,
        lastSeenAt: true,
        customer: {
          select: {
            name: true,
            category: true,
            ga: {
              select: {
                name: true,
              },
            },
          },
        },
        readings: {
          orderBy: { readingDate: "desc" },
          take: 1,
          select: {
            correctedVolumeVb: true,
            currentFlowRate: true,
            gasPressure: true,
            readingDate: true,
          },
        },
        alarms: {
          select: {
            status: true,
            severity: true,
          },
          where: { status: AlarmStatus.OPEN },
        },
      },
    }),
  ]);

  const onlineDevices = devices.filter((device) => {
    if (!device.lastSeenAt) return false;
    return device.lastSeenAt >= yesterday;
  }).length;

  const categoryTotals = buildCategoryTotals(
    devices
      .filter((device) => device.customer && device.readings[0]?.correctedVolumeVb != null)
      .map((device) => ({
        category: device.customer?.category ?? CustomerCategory.RESIDENTIAL,
        totalVolume: device.readings[0]?.correctedVolumeVb ?? 0,
      })),
  );

  const monthlyTotals = new Map<string, number>();
  allReadings.forEach((reading) => {
    const monthKey = getUtcMonthKey(reading.readingDate);
    monthlyTotals.set(monthKey, (monthlyTotals.get(monthKey) ?? 0) + (reading.correctedVolumeVb ?? 0));
  });

  const monthlyConsumption = buildMonthlyConsumptionSeries(
    Array.from(monthlyTotals.entries()).map(([month, value]) => ({ month, value })),
    now,
  );

  const cityTotals = new Map<string, number>();
  devices.forEach((device) => {
    const latestReading = device.readings[0];
    const city = device.customer?.ga?.name;
    const volume = latestReading?.correctedVolumeVb;

    if (city && volume != null) {
      cityTotals.set(city, (cityTotals.get(city) ?? 0) + volume);
    }
  });

  const consumptionByCity = Array.from(cityTotals.entries())
    .map(([city, totalVolume]) => ({ city, totalVolume }))
    .sort((left, right) => right.totalVolume - left.totalVolume);

  const rankedCustomers = devices
    .filter((device) => device.customer)
    .map((device) => {
      const latestReading = device.readings[0];
      const rawFlowValue = latestReading?.correctedVolumeVb ?? latestReading?.currentFlowRate ?? null;
      const suspect = rawFlowValue != null && rawFlowValue > MAX_SUSPECT_VALUE;
      const flowValue = suspect ? null : rawFlowValue;

      return {
        customerName: device.customer?.name ?? "Unassigned",
        deviceSerialNo: device.deviceSerialNo,
        city: device.customer?.ga?.name ?? "—",
        category: device.customer?.category ?? "RESIDENTIAL",
        flowValue,
        suspect,
        status: computeDeviceStatus(device.lastSeenAt, device.alarms, device.customerId),
      };
    })
    .filter((customer) => customer.flowValue != null || customer.suspect)
    .sort((left, right) => (right.flowValue ?? 0) - (left.flowValue ?? 0));

  const topConsumingCustomers = rankedCustomers.slice(0, 5);
  const leastConsumingCustomers = [...rankedCustomers]
    .sort((left, right) => (left.flowValue ?? 0) - (right.flowValue ?? 0))
    .slice(0, 5);

  const [alarms, recentReadings] = await Promise.all([
    db.alarm.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        severity: true,
        status: true,
        createdAt: true,
        device: { select: { deviceSerialNo: true } },
        type: true,
      },
    }),
    db.reading.findMany({
      take: 5,
      orderBy: { receivedAt: "desc" },
      select: {
        id: true,
        receivedAt: true,
        device: { select: { deviceSerialNo: true } },
      },
    }),
  ]);

  const liveEvents = [
    ...alarms.map((alarm) => ({
      id: alarm.id,
      kind: "ALARM" as const,
      label: `${alarm.type} • ${alarm.severity}`,
      message: `Alarm ${alarm.status.toLowerCase()} for ${alarm.device.deviceSerialNo}`,
      timestamp: alarm.createdAt,
    })),
    ...recentReadings.map((reading) => ({
      id: reading.id,
      kind: "READING" as const,
      label: "Reading received",
      message: `Telemetry update from ${reading.device.deviceSerialNo}`,
      timestamp: reading.receivedAt,
    })),
  ]
    .sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime())
    .slice(0, 10);

  return {
    metersOnline: {
      value: onlineDevices,
      totalDevices: devices.length,
      uptimePercent: devices.length ? Math.round((onlineDevices / devices.length) * 100) : 0,
    },
    consumptionByCategory: categoryTotals,
    activeAlerts: openAlertCount,
    monthlyConsumption,
    topConsumingCustomers,
    leastConsumingCustomers,
    consumptionByCity,
    liveEvents,
  };
}
