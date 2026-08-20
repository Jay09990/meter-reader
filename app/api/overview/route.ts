import { NextResponse } from "next/server";
import { getFleetAnalytics, getFleetConsumptionSeries, getFleetOverview } from "@/features/overview/service";
import type { KpiRange } from "@/features/overview/service";
import type { ConsumptionMode } from "@/lib/consumption-series";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawPeriod = searchParams.get("period") ?? "daily";
    const period: ConsumptionMode =
      rawPeriod === "monthly" || rawPeriod === "quarterly" || rawPeriod === "yearly" ? rawPeriod : "daily";
    const rawRange = searchParams.get("range") ?? "today";
    const range: KpiRange =
      rawRange === "month" || rawRange === "quarter" || rawRange === "year" ? rawRange : "today";

    const [overview, analytics, consumption] = await Promise.all([
      getFleetOverview(),
      getFleetAnalytics(range),
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
