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

const CATEGORY_ORDER = ["COMMERCIAL", "RESIDENTIAL", "DRS", "INDUSTRIAL_CNG", "INDUSTRIAL_PNG"] as const;
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
  gaId: string | undefined,
  today: Date = new Date(),
): Promise<ConsumptionBucket[]> {
  const specs = buildBucketSpecs(mode, today);
  const boundaries = uniqueBoundaryDates(specs);

  // One DISTINCT ON query per unique boundary date (parallel)
  const [boundaryMaps, devices] = await Promise.all([
    buildFleetBoundaryMaps(boundaries),
    db.device.findMany({
      where: gaId ? { customer: { gaId } } : undefined,
      select: {
        id: true,
        deviceSerialNo: true,
        category: true,
        customer: {
          select: { name: true },
        },
      },
    }),
  ]);

  const deviceCategories = new Map<string, CustomerCategory | null>();
  devices.forEach((device) => {
    deviceCategories.set(device.id, device.category);
  });

  return specs.map((spec) => {
    const startMap = boundaryMaps.get(spec.startDate)!;
    const endMap   = boundaryMaps.get(spec.endDate)!;

    if (!startMap || !endMap) return { ...spec, value: null, suspect: false };

    // Sum per-device deltas — only for devices present on BOTH sides
    let total = 0;
    let cngTotal = 0;
    let pngTotal = 0;
    let deviceCount = 0;
    const users: Array<{ customerName: string; deviceSerialNo: string; flowValue: number }> = [];

    for (const device of devices) {
      const deviceId = device.id;
      const endVal = endMap.get(deviceId);
      if (endVal == null) continue;
      const startVal = startMap.get(deviceId);
      if (startVal == null) continue; // device missing on start side → skip
      const delta = endVal - startVal;
      if (delta < 0) continue; // skip individual meter resets from the fleet sum
      total += delta;
      deviceCount++;

      users.push({
        customerName: device.customer?.name ?? "Unassigned",
        deviceSerialNo: device.deviceSerialNo,
        flowValue: delta,
      });

      const category = deviceCategories.get(deviceId);
      if (category === CustomerCategory.INDUSTRIAL_CNG) cngTotal += delta;
      if (category === CustomerCategory.INDUSTRIAL_PNG) pngTotal += delta;
    }

    // Sort users descending by flowValue for easy reading
    users.sort((a, b) => b.flowValue - a.flowValue);

    if (deviceCount === 0) {
      return { ...spec, value: null, suspect: false, cngValue: null, pngValue: null, users: [] };
    }
    return {
      ...computeBucket(spec, 0, total), // total is already the fleet delta
      cngValue: cngTotal,
      pngValue: pngTotal,
      users,
    };
  });
}


export async function getFleetOverview(gaId?: string) {
  const now = new Date();
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [totalDevices, reportedToday, offlineDevices, alarmsBySeverity] = await Promise.all([
    db.device.count({ where: gaId ? { customer: { gaId } } : undefined }),
    db.device.count({
      where: { ...(gaId ? { customer: { gaId } } : {}), lastSeenAt: { gte: startOfToday } },
    }),
    db.device.count({
      where: {
        ...(gaId ? { customer: { gaId } } : {}),
        OR: [
          { lastSeenAt: null },
          { lastSeenAt: { lt: yesterday } },
        ],
      },
    }),
    db.alarm.groupBy({
      by: ["severity"],
      where: { status: AlarmStatus.OPEN, ...(gaId ? { device: { customer: { gaId } } } : {}) },
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

export async function getFleetAnalytics(range: KpiRange, gaId: string | undefined, today: Date = new Date()) {
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const todayIso = toIsoDate(today);
  const rangeStartIso = toIsoDate(getRangeStartDate(range, today));

  const [openAlertCount, devices, boundaryMaps] = await Promise.all([
    db.alarm.count({ where: { status: AlarmStatus.OPEN, ...(gaId ? { device: { customer: { gaId } } } : {}) } }),
    db.device.findMany({
      where: gaId ? { customer: { gaId } } : undefined,
      select: {
        id: true,
        deviceSerialNo: true,
        category: true,
        customerId: true,
        lastSeenAt: true,
        customer: {
          select: {
            name: true,
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

  for (const device of devices) {
    const deviceId = device.id;
    const endValue = endMap.get(deviceId);
    if (endValue == null) continue;
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
      .filter((device) => device.category && deviceDeltas.has(device.id))
      .map((device) => ({
        category: device.category!,
        totalVolume: deviceDeltas.get(device.id) ?? 0,
      })),
  );

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
        category: device.category ?? "UNCATEGORIZED",
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
  };
}
