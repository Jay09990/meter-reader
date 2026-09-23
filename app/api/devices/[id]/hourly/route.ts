import { NextRequest, NextResponse } from "next/server";
import { getDeviceHourly } from "@/features/devices";
import { logApi } from "@/lib/api-log";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") || undefined;
    logApi("GET /api/devices/[id]/hourly", { id, date });

    const hourlyData = await getDeviceHourly(id, date);

    if (!hourlyData) {
      logApi("GET /api/devices/[id]/hourly → 404", { id, date });
      return NextResponse.json({ error: "Hourly data not found for specified date" }, { status: 404 });
    }

    logApi("GET /api/devices/[id]/hourly → 200", { id, date });
    return NextResponse.json(hourlyData, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch device hourly data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
