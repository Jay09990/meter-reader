import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logApi } from "@/lib/api-log";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    logApi("POST /api/alarms/[id]/acknowledge", { id });
    const alarm = await db.alarm.update({
      where: { id },
      data: { acknowledged: true, acknowledgedAt: new Date() },
    });
    logApi("POST /api/alarms/[id]/acknowledge → 200", { alarmId: alarm.id });
    return NextResponse.json(alarm);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to acknowledge alarm";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
