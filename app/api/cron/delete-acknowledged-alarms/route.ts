import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/** Delete alarms that have been acknowledged for at least twelve hours. */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authorization = req.headers.get("authorization") ?? "";
  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000);
    const result = await db.alarm.deleteMany({
      where: {
        acknowledged: true,
        acknowledgedAt: { lte: cutoff },
      },
    });

    return NextResponse.json({ ok: true, deleted: result.count });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to delete acknowledged alarms";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
