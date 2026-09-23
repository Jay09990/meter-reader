import { NextRequest, NextResponse } from "next/server";
import { getDeviceLatest } from "@/features/devices";
import { logApi } from "@/lib/api-log";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    logApi("GET /api/devices/[id]/latest", { id });
    const data = await getDeviceLatest(id);

    if (!data) {
      logApi("GET /api/devices/[id]/latest → 404", { id });
      return NextResponse.json({ error: "Device not found" }, { status: 404 });
    }

    logApi("GET /api/devices/[id]/latest → 200", { id });
    return NextResponse.json(data, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch device latest reading";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
