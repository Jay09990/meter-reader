import { NextResponse } from "next/server";
import { getCapacityStatus } from "@/features/system-capacity/service";
import { logApi } from "@/lib/api-log";
import { requireApiUser, unauthorizedResponse } from "@/lib/auth-api";

// Returns the current fleet capacity and unresolved rejected connections.
export async function GET() {
  try {
    const user = await requireApiUser();
    if (!user) return unauthorizedResponse();
    const status = await getCapacityStatus(user.gaId);
    logApi("GET /api/system/capacity-status → 200", { status });
    return NextResponse.json(status);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load capacity status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
