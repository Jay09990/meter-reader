import { NextResponse } from "next/server";
import { acknowledgeRejectedConnections } from "@/features/system-capacity/service";
import { logApi } from "@/lib/api-log";

// Acknowledges all pending capacity rejections after operations reviews them.
export async function POST() {
  try {
    const acknowledged = await acknowledgeRejectedConnections();
    logApi("POST /api/system/rejected-attempts/acknowledge → 200", { acknowledged });
    return NextResponse.json({ acknowledged });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to acknowledge rejected connections";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
