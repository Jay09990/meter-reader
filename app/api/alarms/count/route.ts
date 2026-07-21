import { NextResponse } from "next/server";
import { getOpenAlarmCount } from "@/features/alarms";

export async function GET() {
  try {
    const count = await getOpenAlarmCount();
    return NextResponse.json({ count }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch open alarm count";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
