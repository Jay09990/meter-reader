import { NextRequest, NextResponse } from "next/server";
import { generateMissingDataAlarms } from "@/features/alarms/missing-data";

/**
 * POST /api/cron/missing-data-alarms
 *
 * Intended to be called by an external cron (e.g. Vercel cron, a scheduled
 * task, or curl from a server cron job). Protected by CRON_SECRET header so
 * it isn't a fully open write endpoint.
 *
 * Header required: Authorization: Bearer <CRON_SECRET env var>
 *
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
    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Alarm job failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
