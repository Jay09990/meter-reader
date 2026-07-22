import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { computeDeviceStatus } from "@/lib/device-status";

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
        alarms: {
          where: { status: "OPEN" },
          select: { status: true, severity: true },
        },
      },
    });

    const mapped = devices.map(d => ({
      id: d.id,
      deviceSerialNo: d.deviceSerialNo,
      lat: d.latitude,
      lng: d.longitude,
      status: computeDeviceStatus(d.lastSeenAt, d.alarms, d.customerId),
    }));

    return NextResponse.json(mapped);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load map data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
