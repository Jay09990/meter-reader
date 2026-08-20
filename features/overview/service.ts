import { AlarmStatus, CustomerCategory } from "@prisma/client";
import { db } from "../../lib/db";
import { computeDeviceStatus } from "../../lib/device-status";
import {
  buildBucketSpecs,
  computeBucket,
  uniqueBoundaryDates,
  type ConsumptionMode,
  type ConsumptionBucket,
} from "../../lib/consumption-series";
import { buildFleetBoundaryMaps } from "../../lib/boundary-readings";
import {
  getCurrentQuarterStart,
  getFinancialYearStart,
  getMonthStart,
  toIsoDate,
} from "../../lib/financial-calendar";

const CATEGORY_ORDER = ["INDUSTRIAL", "COMMERCIAL", "RESIDENTIAL", "DRS"] as const;
const MAX_SUSPECT_VALUE = 1_000_000;

export type KpiRange = "today" | "month" | "quarter" | "year";

function getRangeStartDate(range: KpiRange, today: Date): Date {
  switch (range) {
    case "today":
      return new Date(today.getTime() - 24 * 60 * 60 * 1000);
    case "month":
      return getMonthStart(today);
    case "quarter":
      return getCurrentQuarterStart(today);
    case "year":
      return getFinancialYearStart(today);
  }
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

// ─── Fleet consumption series (delta-based) ───────────────────────────────────

/**
 * Compute per-device delta sums for a given period mode.
 *
 * Strategy:
 *  1. Derive all unique boundary dates from the bucket specs.
 *  2. Run one DISTINCT ON query per boundary date (no per-device loops).
 *  3. For each bucket, sum per-device deltas — skipping devices that are
 *     missing a reading on either the start or end boundary (avoids treating
 *     missing-as-zero which would fabricate spikes/drops).
 *  4. Negative fleet-sum → suspect bucket (rare, but possible during rollover).
 */
export async function getFleetConsumptionSeries(
  mode: ConsumptionMode,
  today: Date = new Date(),
): Promise<ConsumptionBucket[]> {
  const specs = buildBucketSpecs(mode, today);
  const boundaries = uniqueBoundaryDates(specs);

  // One DISTINCT ON query per unique boundary date (parallel)
  const boundaryMaps = await buildFleetBoundaryMaps(boundaries);

  return specs.map((spec) => {
    const startMap = boundaryMaps.get(spec.startDate)!;
    const endMap   = boundaryMaps.get(spec.endDate)!;

    if (!startMap || !endMap) return { ...spec, value: null, suspect: false };

    // Sum per-device deltas — only for devices present on BOTH sides
    let total = 0;
    let deviceCount = 0;

    for (const [deviceId, endVal] of endMap) {
      const startVal = startMap.get(deviceId);
      if (startVal == null) continue; // device missing on start side → skip
      const delta = endVal - startVal;
      if (delta < 0) continue; // skip individual meter resets from the fleet sum
      total += delta;
      deviceCount++;
    }

    if (deviceCount === 0) return { ...spec, value: null, suspect: false };
    return computeBucket(spec, 0, total); // total is already the fleet delta
  });
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

export async function getFleetAnalytics(range: KpiRange, today: Date = new Date()) {
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const todayIso = toIsoDate(today);
  const rangeStartIso = toIsoDate(getRangeStartDate(range, today));

  const [openAlertCount, devices, boundaryMaps] = await Promise.all([
    db.alarm.count({ where: { status: AlarmStatus.OPEN } }),
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
        alarms: {
          select: {
            status: true,
            severity: true,
          },
          where: { status: AlarmStatus.OPEN },
        },
      },
    }),
    buildFleetBoundaryMaps([todayIso, rangeStartIso]),
  ]);

  const endMap = boundaryMaps.get(todayIso)!;
  const startMap = boundaryMaps.get(rangeStartIso)!;
  const deviceDeltas = new Map<string, number>();

  for (const [deviceId, endValue] of endMap) {
    const startValue = startMap.get(deviceId);
    if (startValue == null) continue;

    const delta = endValue - startValue;
    if (delta >= 0) deviceDeltas.set(deviceId, delta);
  }

  const onlineDevices = devices.filter((device) => {
    if (!device.lastSeenAt) return false;
    return device.lastSeenAt >= yesterday;
  }).length;

  const categoryTotals = buildCategoryTotals(
    devices
      .filter((device) => device.customer && deviceDeltas.has(device.id))
      .map((device) => ({
        category: device.customer?.category ?? CustomerCategory.RESIDENTIAL,
        totalVolume: deviceDeltas.get(device.id) ?? 0,
      })),
  );

  const gaTotals = new Map<string, number>();
  devices.forEach((device) => {
    const ga = device.customer?.ga?.name;
    const volume = deviceDeltas.get(device.id);

    if (ga && volume != null) {
      gaTotals.set(ga, (gaTotals.get(ga) ?? 0) + volume);
    }
  });

  const consumptionByGa = Array.from(gaTotals.entries())
    .map(([ga, totalVolume]) => ({ ga, totalVolume }))
    .sort((left, right) => right.totalVolume - left.totalVolume);

  const rankedCustomers = devices
    .filter((device) => device.customer)
    .map((device) => {
      const rawFlowValue = deviceDeltas.get(device.id) ?? null;
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
    topConsumingCustomers,
    leastConsumingCustomers,
    consumptionByGa,
    liveEvents,
  };
}
