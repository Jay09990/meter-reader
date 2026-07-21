import { NextRequest, NextResponse } from "next/server";
import { getDeviceLatest } from "@/features/devices";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = await getDeviceLatest(id);

    if (!data) {
      return NextResponse.json({ error: "Device not found" }, { status: 404 });
    }

    return NextResponse.json(data, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch device latest reading";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
