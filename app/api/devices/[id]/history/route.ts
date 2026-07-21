import { NextRequest, NextResponse } from "next/server";
import { getDeviceHistory } from "@/features/devices";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get("days") || "30", 10);

    const history = await getDeviceHistory(id, days);
    return NextResponse.json({ history }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch device history";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
