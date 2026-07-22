import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const alarm = await db.alarm.update({
      where: { id },
      data: { acknowledged: true },
    });
    return NextResponse.json(alarm);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to acknowledge alarm";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
