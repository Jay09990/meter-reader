import { NextRequest, NextResponse } from "next/server";
import { getDeviceHistory } from "@/features/devices";
import { logApi } from "@/lib/api-log";
import { requireApiUser, unauthorizedResponse } from "@/lib/auth-api";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireApiUser();
    if (!user) return unauthorizedResponse();
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const days = Math.max(1, Math.min(365, parseInt(searchParams.get("days") || "30", 10) || 30));
    logApi("GET /api/devices/[id]/history", { id, days });

    const history = await getDeviceHistory(id, user.gaId, days);
    logApi("GET /api/devices/[id]/history → 200", { id, days, points: history.length });
    return NextResponse.json({ history }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch device history";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
