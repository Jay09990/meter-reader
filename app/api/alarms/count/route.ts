import { NextResponse } from "next/server";
import { getOpenAlarmCount } from "@/features/alarms";
import { logApi } from "@/lib/api-log";
import { getGaScope, requireApiUser, unauthorizedResponse } from "@/lib/auth-api";

export async function GET() {
  try {
    const user = await requireApiUser();
    if (!user) return unauthorizedResponse();
    const count = await getOpenAlarmCount(getGaScope(user));
    logApi("GET /api/alarms/count → 200", { count });
    return NextResponse.json({ count }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch open alarm count";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
