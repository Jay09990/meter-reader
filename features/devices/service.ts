import { db } from "@/lib/db";
import { AlarmSeverity, AlarmStatus, Prisma } from "@prisma/client";
import { computeDeviceStatus } from "@/lib/device-status";

interface DailyVolumeDelta {
  correctedVolumeVb: number | null;
  uncorrectedVolumeVm: number | null;
}

function calculateVolumeDelta(
  currentValue: number | null,
  previousValue: number | null,
): number | null {
  return currentValue == null || previousValue == null ? null : currentValue - previousValue;
}

async function getDailyVolumeDelta(
  deviceId: string,
  latestReading: {
    readingDate: Date;
    correctedVolumeVb: number | null;
    uncorrectedVolumeVm: number | null;
  },
): Promise<DailyVolumeDelta> {
  const currentDayStart = new Date(latestReading.readingDate);
  currentDayStart.setUTCHours(0, 0, 0, 0);
  const previousDayStart = new Date(currentDayStart);
  previousDayStart.setUTCDate(previousDayStart.getUTCDate() - 1);

  const previousReading = await db.reading.findFirst({
    where: {
      deviceId,
      readingDate: { gte: previousDayStart, lt: currentDayStart },
    },
    orderBy: { receivedAt: "desc" },
    select: {
      correctedVolumeVb: true,
      uncorrectedVolumeVm: true,
    },
  });

  return {
    correctedVolumeVb: calculateVolumeDelta(
      latestReading.correctedVolumeVb,
      previousReading?.correctedVolumeVb ?? null,
    ),
    uncorrectedVolumeVm: calculateVolumeDelta(
      latestReading.uncorrectedVolumeVm,
      previousReading?.uncorrectedVolumeVm ?? null,
    ),
  };
}

export interface GetDevicesOptions {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  category?: string;
  gaId?: string;
}

function mapDeviceToItem(
  device: {
    id: string;
    deviceSerialNo: string;
    meterSerialNo: string | null;
    meterSize: string | null;
    customerId: string | null;
    firmwareVersion: string | null;
    hardwareVersion: string | null;
    deviceModel: string | null;
    configurationVersion: string | null;
    latitude: number | null;
    longitude: number | null;
    pressureUpperLimit: number | null;
    pressureLowerLimit: number | null;
    temperatureUpperLimit: number | null;
    temperatureLowerLimit: number | null;
    consumptionUpperLimit: number | null;
    consumptionLowerLimit: number | null;
    batteryLowerLimit: number | null;
    firstSeenAt: Date;
    lastSeenAt: Date | null;
    readings: Array<{
      readingDate: Date;
      receivedAt: Date;
      correctedVolumeVb: number | null;
      gasPressure: number | null;
      gasTemperature: number | null;
      currentFlowRate: number | null;
      batteryLevel: number | null;
    }>;
    alarms: Array<{
      status: AlarmStatus;
      severity: AlarmSeverity;
    }>;
    customer?: {
      id?: string | null;
      name?: string | null;
      category?: string | null;
      address?: string | null;
      gaId?: string | null;
      ga?: { name?: string | null } | null;
    } | null;
  },
  customerOverride?: {
    id?: string | null;
    name?: string | null;
    category?: string | null;
    address?: string | null;
    gaId?: string | null;
    gaName?: string | null;
  },
) {
  const latestReading = device.readings[0] || null;
  const resolvedCustomer = customerOverride ?? {
    id: device.customer?.id ?? null,
    name: device.customer?.name ?? null,
    category: device.customer?.category ?? null,
    address: device.customer?.address ?? null,
    gaId: device.customer?.gaId ?? null,
    gaName: device.customer?.ga?.name ?? null,
  };

  return {
    id: device.id,
    deviceSerialNo: device.deviceSerialNo,
    meterSerialNo: device.meterSerialNo,
    meterSize: device.meterSize,
    customerId: device.customerId,
    customerName: resolvedCustomer?.name || null,
    category: resolvedCustomer?.category || null,
    address: resolvedCustomer?.address || null,
    gaName: resolvedCustomer?.gaName || null,
    gaId: resolvedCustomer?.gaId || null,
    firmwareVersion: device.firmwareVersion,
    hardwareVersion: device.hardwareVersion,
    deviceModel: device.deviceModel,
    configurationVersion: device.configurationVersion,
    latitude: device.latitude,
    longitude: device.longitude,
    pressureUpperLimit: device.pressureUpperLimit,
    pressureLowerLimit: device.pressureLowerLimit,
    temperatureUpperLimit: device.temperatureUpperLimit,
    temperatureLowerLimit: device.temperatureLowerLimit,
    consumptionUpperLimit: device.consumptionUpperLimit,
    consumptionLowerLimit: device.consumptionLowerLimit,
    batteryLowerLimit: device.batteryLowerLimit,
    firstSeenAt: device.firstSeenAt,
    lastSeenAt: device.lastSeenAt,
    status: computeDeviceStatus(device.lastSeenAt, device.alarms, device.customerId),
    latestReading: latestReading
      ? {
          readingDate: latestReading.readingDate.toISOString(),
          receivedAt: latestReading.receivedAt.toISOString(),
          correctedVolumeVb: latestReading.correctedVolumeVb,
          gasPressure: latestReading.gasPressure,
          gasTemperature: latestReading.gasTemperature,
          currentFlowRate: latestReading.currentFlowRate,
          batteryLevel: latestReading.batteryLevel,
        }
      : null,
  };
}

export async function getPaginatedDevices(options: GetDevicesOptions) {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 10));
  const skip = (page - 1) * limit;

  const where: Prisma.DeviceWhereInput = {};

  if (options.search && options.search.trim()) {
    const s = options.search.trim();
    where.OR = [
      { deviceSerialNo: { contains: s, mode: "insensitive" } },
      { meterSerialNo: { contains: s, mode: "insensitive" } },
      { customer: { name: { contains: s, mode: "insensitive" } } },
      { customer: { ga: { name: { contains: s, mode: "insensitive" } } } },
    ];
  }

  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  if (options.category) {
    where.customer = { category: options.category as import("@prisma/client").CustomerCategory };
  }

  if (options.gaId) {
    where.customer = {
      ...(where.customer as Prisma.CustomerWhereInput || {}),
      gaId: options.gaId,
    };
  }

  if (options.status && options.status !== "all") {
    const statusVal = options.status.toLowerCase();
    if (statusVal === "new") {
      where.customerId = null;
    } else if (statusVal === "online") {
      where.customerId = { not: null };
      where.lastSeenAt = { gte: twentyFourHoursAgo };
      where.alarms = { none: { status: "OPEN" } };
    } else if (statusVal === "offline") {
      where.customerId = { not: null };
      where.OR = [
        { lastSeenAt: null },
        { lastSeenAt: { lt: twentyFourHoursAgo } },
      ];
    } else if (statusVal === "alert") {
      where.customerId = { not: null };
      where.alarms = { some: { status: "OPEN" } };
    }
  }

  const [devices, totalCount] = await Promise.all([
    db.device.findMany({
      where,
      skip,
      take: limit,
      orderBy: { lastSeenAt: "desc" },
      include: {
        readings: {
          take: 1,
          orderBy: { receivedAt: "desc" },
          select: {
            readingDate: true,
            receivedAt: true,
            correctedVolumeVb: true,
            gasPressure: true,
            gasTemperature: true,
            currentFlowRate: true,
            batteryLevel: true,
          },
        },
        alarms: {
          where: { status: "OPEN" },
          select: { status: true, severity: true },
        },
        customer: {
          select: {
            id: true,
            name: true,
            category: true,
            address: true,
            gaId: true,
            ga: { select: { name: true } },
          },
        },
      },
    }),
    db.device.count({ where }),
  ]);

  const items = devices.map((d) => mapDeviceToItem(d));

  return {
    items,
    pagination: {
      page,
      limit,
      totalCount,
      totalPages: Math.ceil(totalCount / limit) || 1,
    },
  };
}

export async function getPaginatedCustomersWithDevices(options: GetDevicesOptions) {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 10));
  const skip = (page - 1) * limit;

  const where: Prisma.CustomerWhereInput = {};

  if (options.search && options.search.trim()) {
    const s = options.search.trim();
    where.OR = [
      { name: { contains: s, mode: "insensitive" } },
      { ga: { name: { contains: s, mode: "insensitive" } } },
      { devices: { some: { deviceSerialNo: { contains: s, mode: "insensitive" } } } },
      { devices: { some: { meterSerialNo: { contains: s, mode: "insensitive" } } } },
    ];
  }

  if (options.category) {
    where.category = options.category as import("@prisma/client").CustomerCategory;
  }

  if (options.gaId) {
    where.gaId = options.gaId;
  }

  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  if (options.status && options.status !== "all") {
    const statusVal = options.status.toLowerCase();
    if (statusVal === "new") {
      where.devices = { some: { customerId: null } };
    } else if (statusVal === "online") {
      where.devices = {
        some: {
          customerId: { not: null },
          lastSeenAt: { gte: twentyFourHoursAgo },
          alarms: { none: { status: "OPEN" } },
        },
      };
    } else if (statusVal === "offline") {
      where.devices = {
        some: {
          customerId: { not: null },
          OR: [
            { lastSeenAt: null },
            { lastSeenAt: { lt: twentyFourHoursAgo } },
          ],
        },
      };
    } else if (statusVal === "alert") {
      where.devices = {
        some: {
          customerId: { not: null },
          alarms: { some: { status: "OPEN" } },
        },
      };
    }
  }

  const [customers, totalCount] = await Promise.all([
    db.customer.findMany({
      where,
      skip,
      take: limit,
      orderBy: { name: "asc" },
      include: {
        ga: { select: { name: true } },
        devices: {
          include: {
            readings: {
              take: 1,
              orderBy: { receivedAt: "desc" },
              select: {
                readingDate: true,
                receivedAt: true,
                correctedVolumeVb: true,
                gasPressure: true,
                gasTemperature: true,
                currentFlowRate: true,
                batteryLevel: true,
              },
            },
            alarms: {
              where: { status: "OPEN" },
              select: { status: true, severity: true },
            },
          },
        },
      },
    }),
    db.customer.count({ where }),
  ]);

  const items = customers.map((customer) => {
    const devices = (customer.devices ?? []).map((device) =>
      mapDeviceToItem(device, {
        id: customer.id,
        name: customer.name,
        category: customer.category,
        address: customer.address,
        gaId: customer.gaId,
        gaName: customer.ga?.name || null,
      }),
    );

    return {
      id: customer.id,
      name: customer.name,
      category: customer.category,
      address: customer.address,
      gaId: customer.gaId,
      gaName: customer.ga?.name || null,
      deviceCount: devices.length,
      devices,
    };
  });

  return {
    items,
    pagination: {
      page,
      limit,
      totalCount,
      totalPages: Math.ceil(totalCount / limit) || 1,
    },
  };
}

export async function getDeviceLatest(deviceIdOrSerial: string) {
  const device = await db.device.findFirst({
    where: {
      OR: [{ id: deviceIdOrSerial }, { deviceSerialNo: deviceIdOrSerial }],
    },
    include: {
      readings: {
        take: 1,
        // CHANGED: same reasoning as getPaginatedDevices above.
        orderBy: { receivedAt: "desc" },
      },
      alarms: {
        where: { status: "OPEN" },
        select: { status: true, severity: true },
      },
      customer: {
        select: { name: true, ga: { select: { name: true } } }
      },
    },
  });

  if (!device) {
    return null;
  }

  const latestReading = device.readings[0] || null;
  const dailyVolume = latestReading
    ? await getDailyVolumeDelta(device.id, latestReading)
    : null;

  return {
    device: {
      id: device.id,
      deviceSerialNo: device.deviceSerialNo,
      meterSerialNo: device.meterSerialNo,
      meterSize: device.meterSize,
      firmwareVersion: device.firmwareVersion,
      hardwareVersion: device.hardwareVersion,
      deviceModel: device.deviceModel,
      configurationVersion: device.configurationVersion,
      customerName: device.customer?.name || null,
      gaName: device.customer?.ga?.name || null,
      firstSeenAt: device.firstSeenAt,
      lastSeenAt: device.lastSeenAt,
      status: computeDeviceStatus(device.lastSeenAt, device.alarms, device.customerId),
      batteryLowerLimit: device.batteryLowerLimit,
      pressureUpperLimit: device.pressureUpperLimit,
      pressureLowerLimit: device.pressureLowerLimit,
      temperatureUpperLimit: device.temperatureUpperLimit,
      temperatureLowerLimit: device.temperatureLowerLimit,
      consumptionUpperLimit: device.consumptionUpperLimit,
      consumptionLowerLimit: device.consumptionLowerLimit,
    },
    latestReading: latestReading
      ? {
          id: latestReading.id,
          readingDate: latestReading.readingDate.toISOString(),
          correctedVolumeVb: latestReading.correctedVolumeVb,
          uncorrectedVolumeVm: latestReading.uncorrectedVolumeVm,
          gasPressure: latestReading.gasPressure,
          pressureMax: latestReading.pressureMax,
          pressureMin: latestReading.pressureMin,
          gasTemperature: latestReading.gasTemperature,
          temperatureMax: latestReading.temperatureMax,
          temperatureMin: latestReading.temperatureMin,
          compressibilityZ: latestReading.compressibilityZ,
          compressibilityFpv: latestReading.compressibilityFpv,
          correctionFactorC: latestReading.correctionFactorC,
          gasDensity: latestReading.gasDensity,
          hourlyConsumption: latestReading.hourlyConsumption,
          batteryLevel: latestReading.batteryLevel,
          receivedAt: latestReading.receivedAt,
        }
      : null,
    dailyVolume,
  };
}

export async function getDeviceHistory(deviceIdOrSerial: string, days: number = 30) {
  const device = await db.device.findFirst({
    where: {
      OR: [{ id: deviceIdOrSerial }, { deviceSerialNo: deviceIdOrSerial }],
    },
    select: { id: true },
  });

  if (!device) return [];

  const startDate = new Date();
  startDate.setUTCDate(startDate.getUTCDate() - days);

  // CHANGED (per request): the trend chart now plots EVERY push in range,
  // not just the latest one per day — no more latest-per-day collapse.
  // Ordered chronologically by receivedAt (actual arrival order), which
  // is what should drive the chart's x-axis, not readingDate alone (two
  // pushes tagged with the same readingDate still need a stable, real
  // order to plot left-to-right correctly).
  //
  // NOTE: this is deliberately scoped to the trend chart only. KPI cards
  // (getDeviceLatest, the readings included in getPaginatedDevices) and
  // the gas-out-of-range alarm baseline (features/ingest/alarm-check.ts)
  // still use "latest push per day" / "latest push overall" — those
  // represent "the current true value," which is a different question
  // from "show me the whole history," so they weren't touched here.
  const readings = await db.reading.findMany({
    where: {
      deviceId: device.id,
      readingDate: { gte: startDate },
    },
    orderBy: { receivedAt: "asc" },
    select: {
      readingDate: true,
      receivedAt: true,
      correctedVolumeVb: true,
      uncorrectedVolumeVm: true,
      gasPressure: true,
      gasTemperature: true,
    },
  });

  return readings.map((r) => ({
    date: r.readingDate.toISOString().split("T")[0],
    timestamp: r.receivedAt.toISOString(), // NEW — lets the frontend tell
    // apart multiple same-day pushes on the chart's x-axis
    correctedVolumeVb: r.correctedVolumeVb,
    uncorrectedVolumeVm: r.uncorrectedVolumeVm,
    gasPressure: r.gasPressure,
    gasTemperature: r.gasTemperature,
  }));
}

export async function getDeviceHourly(deviceIdOrSerial: string, dateStr?: string) {
  const device = await db.device.findFirst({
    where: {
      OR: [{ id: deviceIdOrSerial }, { deviceSerialNo: deviceIdOrSerial }],
    },
    select: { id: true },
  });

  if (!device) return null;

  let reading;
  if (dateStr) {
    const targetDate = new Date(dateStr);
    const normalized = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate()));

    // CHANGED: (deviceId, readingDate) is no longer unique, so this can
    // no longer be a findUnique on that compound key — findFirst ordered
    // by receivedAt desc gets the latest push for that specific date.
    reading = await db.reading.findFirst({
      where: {
        deviceId: device.id,
        readingDate: normalized,
      },
      orderBy: { receivedAt: "desc" },
      select: {
        readingDate: true,
        hourlyConsumption: true,
      },
    });
  } else {
    // CHANGED: tie-break by receivedAt so that if the most recent date
    // has several pushes, we still get the latest one, not just "some"
    // row for that date.
    reading = await db.reading.findFirst({
      where: { deviceId: device.id },
      orderBy: [{ readingDate: "desc" }, { receivedAt: "desc" }],
      select: {
        readingDate: true,
        hourlyConsumption: true,
      },
    });
  }

  if (!reading) return null;

  return {
    date: reading.readingDate.toISOString().split("T")[0],
    hourlyConsumption: reading.hourlyConsumption || [],
  };
}

// ─── Consumption series (delta-based) ────────────────────────────────────────

export async function getDeviceConsumptionSeries(
  deviceIdOrSerial: string,
  mode: import("@/lib/consumption-series").ConsumptionMode,
) {
  // Resolve to internal id first
  const device = await db.device.findFirst({
    where: {
      OR: [{ id: deviceIdOrSerial }, { deviceSerialNo: deviceIdOrSerial }],
    },
    select: { id: true },
  });

  if (!device) return [];

  const { buildConsumptionSeries } = await import("@/lib/consumption-series");
  const { makeDeviceBoundaryResolver } = await import("@/lib/boundary-readings");

  return buildConsumptionSeries(mode, makeDeviceBoundaryResolver(device.id));
}
