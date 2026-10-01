import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getYesterdayNigeriaDate } from "@/lib/nigeria-date";
import { sendDailyReport } from "@/features/reports/daily-report-email";
import { logApi } from "@/lib/api-log";

/** Claim the unique report date before sending so concurrent triggers cannot duplicate the email. */
async function sendDailyReportOnce(forDateStr: string) {
  const forDate = new Date(`${forDateStr}T00:00:00.000Z`);
  try {
    await db.dailyReportDelivery.create({ data: { forDate } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { sent: false, skipped: "Daily report already claimed for this date", customersIncluded: 0 };
    }
    throw error;
  }

  return sendDailyReport(forDateStr);
}

/**
 * GET /api/cron/daily-report
 *
 * Invoked by an external scheduler at the configured Nigeria time. Sends
 * yesterday's Nigeria-calendar-day consumption summary to the configured
 * alarm notification email.
 *
 * The schedule time is user-configurable in Settings → "Daily Report Schedule" (Nigeria time).
 * Repeated calls for the same report date are safely skipped.
 *
 * Protected by CRON_SECRET (same pattern as other cron routes).
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  logApi("GET /api/cron/daily-report");

  const forDateStr = getYesterdayNigeriaDate().toISOString().split("T")[0];

  try {
    const result = await sendDailyReportOnce(forDateStr);
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
  const auth = req.headers.get("authorization") ?? "";
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
      forDateStr = getYesterdayNigeriaDate().toISOString().split("T")[0];
    }
  } catch {
    forDateStr = getYesterdayNigeriaDate().toISOString().split("T")[0];
  }

  try {
    const result = await sendDailyReportOnce(forDateStr);
    logApi("POST /api/cron/daily-report → 200", { forDateStr, result });
    return NextResponse.json({ ok: true, forDate: forDateStr, ...result }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Daily report job failed";
    logApi("POST /api/cron/daily-report → 500", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
