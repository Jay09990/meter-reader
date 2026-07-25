import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { computeDeviceStatus } from "@/lib/device-status";

export interface GetDevicesOptions {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  category?: string;
  gaId?: string;
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
          // CHANGED: was orderBy readingDate desc, which was ambiguous
          // once a device can have several rows for the same day. Order
          // by receivedAt (actual push arrival time) so "latest reading"
          // always means the most recent push, full stop.
          orderBy: { receivedAt: "desc" },
          select: {
            readingDate: true,
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
            name: true, 
            category: true,
            address: true,
            ga: { select: { name: true } } 
          }
        },
      },
    }),
    db.device.count({ where }),
  ]);

  const items = devices.map((d) => {
    const latestReading = d.readings[0] || null;

    return {
      id: d.id,
      deviceSerialNo: d.deviceSerialNo,
      meterSerialNo: d.meterSerialNo,
      meterSize: d.meterSize,
      customerName: d.customer?.name || null,
      category: d.customer?.category || null,
      address: d.customer?.address || null,
      gaName: d.customer?.ga?.name || null,
      firmwareVersion: d.firmwareVersion,
      hardwareVersion: d.hardwareVersion,
      deviceModel: d.deviceModel,
      configurationVersion: d.configurationVersion,
      firstSeenAt: d.firstSeenAt,
      lastSeenAt: d.lastSeenAt,
      status: computeDeviceStatus(d.lastSeenAt, d.alarms, d.customerId),
      latestReading: latestReading
        ? {
            readingDate: latestReading.readingDate.toISOString(),
            correctedVolumeVb: latestReading.correctedVolumeVb,
            gasPressure: latestReading.gasPressure,
            gasTemperature: latestReading.gasTemperature,
            currentFlowRate: latestReading.currentFlowRate,
            batteryLevel: latestReading.batteryLevel,
          }
        : null,
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
          receivedAt: latestReading.receivedAt,
        }
      : null,
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