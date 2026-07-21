import { NextResponse } from "next/server";
import { getFleetOverview } from "@/features/overview";

export async function GET() {
  try {
    const overview = await getFleetOverview();
    return NextResponse.json(overview, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch fleet overview";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
