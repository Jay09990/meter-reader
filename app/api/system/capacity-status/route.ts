import { NextResponse } from "next/server";
import { getCapacityStatus } from "@/features/system-capacity/service";

// Returns the current fleet capacity and unresolved rejected connections.
export async function GET() {
  try {
    return NextResponse.json(await getCapacityStatus());
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load capacity status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
