import { NextResponse } from "next/server";
import { getFleetAnalytics, getFleetOverview } from "@/features/overview";

export async function GET() {
  try {
    const [overview, analytics] = await Promise.all([getFleetOverview(), getFleetAnalytics()]);
    return NextResponse.json({
      ...overview,
      ...analytics,
    }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch AMR overview";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
