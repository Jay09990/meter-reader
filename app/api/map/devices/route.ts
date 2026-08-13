import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getMapMarkerColor } from "@/lib/device-status";

function getMonthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function getMonthLabel(date: Date) {
  return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][date.getUTCMonth()];
}

export async function GET() {
  try {
    const devices = await db.device.findMany({
      where: {
        latitude: { not: null },
        longitude: { not: null },
      },
      select: {
        id: true,
        deviceSerialNo: true,
        latitude: true,
        longitude: true,
        lastSeenAt: true,
        customerId: true,
        customer: {
          select: {
            name: true,
            address: true,
            ga: {
              select: {
                name: true,
              },
            },
          },
        },
        readings: {
          orderBy: { receivedAt: "desc" },
          take: 1,
          select: {
            receivedAt: true,
            correctedVolumeVb: true,
            currentFlowRate: true,
            gasPressure: true,
            batteryLevel: true,
          },
        },
        alarms: {
          where: { status: "OPEN" },
          select: { status: true, severity: true, cause: true, createdAt: true, forDate: true },
        },
      },
    });

    const monthlyHistory = await Promise.all(
      devices.map(async (device) => {
        const history = await db.reading.findMany({
          where: { deviceId: device.id },
          select: { readingDate: true, correctedVolumeVb: true },
          orderBy: { readingDate: "asc" },
        });

        const totals = new Map<string, number>();
        history.forEach((reading) => {
          const monthKey = getMonthKey(reading.readingDate);
          totals.set(monthKey, (totals.get(monthKey) ?? 0) + (reading.correctedVolumeVb ?? 0));
        });

        return {
          deviceId: device.id,
          series: Array.from({ length: 12 }, (_, index) => {
            const monthDate = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - (11 - index), 1));
            const monthKey = getMonthKey(monthDate);
            return {
              month: getMonthLabel(monthDate),
              value: totals.get(monthKey) ?? 0,
            };
          }),
        };
      }),
    );

    const historyByDeviceId = new Map(monthlyHistory.map((item) => [item.deviceId, item.series]));

    const mapped = devices.map((device) => {
      const latestReading = device.readings[0];
      const markerColor = getMapMarkerColor(device.lastSeenAt, device.alarms, device.customerId);

      return {
        id: device.id,
        deviceSerialNo: device.deviceSerialNo,
        lat: device.latitude,
        lng: device.longitude,
        markerColor,
        customerName: device.customer?.name ?? "Unassigned",
        city: device.customer?.ga?.name ?? "—",
        address: device.customer?.address ?? "No address on file",
        latestReading: latestReading ? {
          correctedVolumeVb: latestReading.correctedVolumeVb,
          currentFlowRate: latestReading.currentFlowRate,
          gasPressure: latestReading.gasPressure,
          batteryLevel: latestReading.batteryLevel,
          receivedAt: latestReading.receivedAt.toISOString(),
        } : null,
        updateCadence: "Daily",
        lastSyncedAt: device.lastSeenAt,
        alarms: device.alarms,
        monthlyConsumption: historyByDeviceId.get(device.id) ?? [],
      };
    });

    return NextResponse.json(mapped);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load map data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
