import { NextRequest, NextResponse } from "next/server";
import { getSystemSettings } from "@/features/system-capacity/service";
import { logApi } from "@/lib/api-log";

/**
 * Read the configured daily report time for the external cron checker.
 * This endpoint is protected by the same shared secret as the job routes.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { reportScheduleTime } = await getSystemSettings();
  logApi("GET /api/cron/report-schedule → 200", { reportScheduleTime });
  return NextResponse.json({ reportScheduleTime });
}
