import { NextRequest, NextResponse } from "next/server";
import { sendDailyReport } from "@/features/reports/daily-report-email";
import { logApi } from "@/lib/api-log";

/**
 * GET /api/cron/daily-report
 *
 * Invoked automatically by Vercel Cron at the time configured in vercel.json
 * (default 07:00 UTC). Sends yesterday's consumption summary to the configured
 * alarm notification email.
 *
 * The schedule time is user-configurable in Settings → "Daily Report Schedule".
 * Changing it requires updating vercel.json's cron schedule OR using an
 * external scheduler that calls this endpoint via POST at the desired time.
 *
 * Protected by CRON_SECRET (same pattern as other cron routes).
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  logApi("GET /api/cron/daily-report");

  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const forDateStr = yesterday.toISOString().split("T")[0];

  try {
    const result = await sendDailyReport(forDateStr);
    logApi("GET /api/cron/daily-report → 200", { forDateStr, result });
    return NextResponse.json({ ok: true, forDate: forDateStr, ...result }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Daily report job failed";
    logApi("GET /api/cron/daily-report → 500", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/cron/daily-report
 *
 * Manual or external-scheduler trigger. Accepts an optional body:
 * { "forDate": "YYYY-MM-DD" } — defaults to yesterday.
 *
 * Header required: Authorization: Bearer <CRON_SECRET>
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  logApi("POST /api/cron/daily-report");

  let forDateStr: string;
  try {
    const body = (await req.json().catch(() => ({}))) as { forDate?: string };
    if (body.forDate) {
      const d = new Date(body.forDate);
      if (isNaN(d.getTime())) {
        return NextResponse.json(
          { error: "Invalid forDate — expected YYYY-MM-DD" },
          { status: 400 },
        );
      }
      forDateStr = body.forDate;
    } else {
      const yesterday = new Date();
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      forDateStr = yesterday.toISOString().split("T")[0];
    }
  } catch {
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    forDateStr = yesterday.toISOString().split("T")[0];
  }

  try {
    const result = await sendDailyReport(forDateStr);
    logApi("POST /api/cron/daily-report → 200", { forDateStr, result });
    return NextResponse.json({ ok: true, forDate: forDateStr, ...result }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Daily report job failed";
    logApi("POST /api/cron/daily-report → 500", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
