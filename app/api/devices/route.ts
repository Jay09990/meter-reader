import { NextRequest, NextResponse } from "next/server";
import { getPaginatedDevices } from "@/features/devices";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "10", 10);
    const search = searchParams.get("search") || "";
    const status = (searchParams.get("status") || "all") as "all" | "reporting" | "stale";

    const result = await getPaginatedDevices({ page, limit, search, status });
    return NextResponse.json(result, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch devices";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
