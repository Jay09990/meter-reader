import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

export interface GetDevicesOptions {
  page?: number;
  limit?: number;
  search?: string;
  status?: "all" | "reporting" | "stale";
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
      { siteLabel: { contains: s, mode: "insensitive" } },
      { stationLabel: { contains: s, mode: "insensitive" } },
    ];
  }

  const now = new Date();
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  if (options.status === "reporting") {
    where.lastSeenAt = { gte: startOfToday };
  } else if (options.status === "stale") {
    where.OR = [
      { lastSeenAt: null },
      { lastSeenAt: { lt: startOfToday } },
    ];
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
          orderBy: { readingDate: "desc" },
          select: {
            readingDate: true,
            correctedVolumeVb: true,
            gasPressure: true,
            gasTemperature: true,
          },
        },
      },
    }),
    db.device.count({ where }),
  ]);

  const items = devices.map((d) => {
    const latestReading = d.readings[0] || null;
    const isReporting = d.lastSeenAt && d.lastSeenAt >= startOfToday;

    return {
      id: d.id,
      deviceSerialNo: d.deviceSerialNo,
      meterSerialNo: d.meterSerialNo,
      meterSize: d.meterSize,
      siteLabel: d.siteLabel,
      stationLabel: d.stationLabel,
      firmwareVersion: d.firmwareVersion,
      hardwareVersion: d.hardwareVersion,
      deviceModel: d.deviceModel,
      configurationVersion: d.configurationVersion,
      firstSeenAt: d.firstSeenAt,
      lastSeenAt: d.lastSeenAt,
      status: isReporting ? "REPORTING" : "STALE",
      latestReading: latestReading
        ? {
            readingDate: latestReading.readingDate.toISOString().split("T")[0],
            correctedVolumeVb: latestReading.correctedVolumeVb,
            gasPressure: latestReading.gasPressure,
            gasTemperature: latestReading.gasTemperature,
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
        orderBy: { readingDate: "desc" },
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
      siteLabel: device.siteLabel,
      stationLabel: device.stationLabel,
      firstSeenAt: device.firstSeenAt,
      lastSeenAt: device.lastSeenAt,
    },
    latestReading: latestReading
      ? {
          id: latestReading.id,
          readingDate: latestReading.readingDate.toISOString().split("T")[0],
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

  const readings = await db.reading.findMany({
    where: {
      deviceId: device.id,
      readingDate: { gte: startDate },
    },
    orderBy: { readingDate: "asc" },
    select: {
      readingDate: true,
      correctedVolumeVb: true,
      uncorrectedVolumeVm: true,
      gasPressure: true,
      gasTemperature: true,
    },
  });

  return readings.map((r) => ({
    date: r.readingDate.toISOString().split("T")[0],
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

    reading = await db.reading.findUnique({
      where: {
        deviceId_readingDate: {
          deviceId: device.id,
          readingDate: normalized,
        },
      },
      select: {
        readingDate: true,
        hourlyConsumption: true,
      },
    });
  } else {
    reading = await db.reading.findFirst({
      where: { deviceId: device.id },
      orderBy: { readingDate: "desc" },
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
