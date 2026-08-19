import { NextResponse } from "next/server";
import { acknowledgeRejectedConnections } from "@/features/system-capacity/service";

// Acknowledges all pending capacity rejections after operations reviews them.
export async function POST() {
  try {
    return NextResponse.json({ acknowledged: await acknowledgeRejectedConnections() });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to acknowledge rejected connections";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
