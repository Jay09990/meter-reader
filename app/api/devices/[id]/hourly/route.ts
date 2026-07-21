import { NextRequest, NextResponse } from "next/server";
import { getDeviceHourly } from "@/features/devices";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") || undefined;

    const hourlyData = await getDeviceHourly(id, date);

    if (!hourlyData) {
      return NextResponse.json({ error: "Hourly data not found for specified date" }, { status: 404 });
    }

    return NextResponse.json(hourlyData, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch device hourly data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
