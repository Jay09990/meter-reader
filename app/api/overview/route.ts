import { NextResponse } from "next/server";
import { getFleetAnalytics, getFleetConsumptionSeries, getFleetOverview } from "@/features/overview/service";
import type { ConsumptionMode } from "@/lib/consumption-series";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawPeriod = searchParams.get("period") ?? "daily";
    const period: ConsumptionMode =
      rawPeriod === "monthly" || rawPeriod === "quarterly" ? rawPeriod : "daily";

    const [overview, analytics, consumption] = await Promise.all([
      getFleetOverview(),
      getFleetAnalytics(),
      getFleetConsumptionSeries(period),
    ]);

    return NextResponse.json({
      ...overview,
      ...analytics,
      consumption,
    }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch AMR overview";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
