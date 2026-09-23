import { NextRequest, NextResponse } from "next/server";
import { generateMissingDataAlarms } from "@/features/alarms/missing-data";
import { logApi } from "@/lib/api-log";

/**
 * GET /api/cron/missing-data-alarms
 *
 * Invoked automatically by Vercel Cron (see vercel.json) — Vercel always
 * calls cron endpoints via GET and cannot send a request body, so this
 * always runs against the default target date (yesterday).
 * Vercel automatically attaches `Authorization: Bearer <CRON_SECRET>`
 * when CRON_SECRET is set in the project's environment variables.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  logApi("GET /api/cron/missing-data-alarms");
  try {
    const result = await generateMissingDataAlarms();
    logApi("GET /api/cron/missing-data-alarms → 200", { result });
    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Alarm job failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/cron/missing-data-alarms
 *
 * Manual/scripted trigger — e.g. local testing via curl, or an external
 * cron/task runner that can send a body. Protected by the same
 * CRON_SECRET check as GET.
 *
 * Header required: Authorization: Bearer <CRON_SECRET env var>
 * Optional body: { "forDate": "YYYY-MM-DD" } — defaults to yesterday.
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  logApi("POST /api/cron/missing-data-alarms");
  let forDate: Date | undefined;
  try {
    const body = await req.json().catch(() => ({})) as { forDate?: string };
    if (body.forDate) {
      const d = new Date(body.forDate);
      if (isNaN(d.getTime())) {
        return NextResponse.json(
          { error: "Invalid forDate — expected YYYY-MM-DD" },
          { status: 400 }
        );
      }
      forDate = d;
    }
  } catch {
    // no body — use default (yesterday)
  }

  try {
    const result = await generateMissingDataAlarms(forDate);
    logApi("POST /api/cron/missing-data-alarms → 200", { forDate: forDate?.toISOString() ?? "default(yesterday)", result });
    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Alarm job failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}