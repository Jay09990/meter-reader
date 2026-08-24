import { NextResponse } from "next/server";
import { getFleetConsumptionSeries } from "@/features/overview/service";
import type { ConsumptionMode } from "@/lib/consumption-series";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawPeriod = searchParams.get("period") ?? "daily";
    const period: ConsumptionMode =
      rawPeriod === "monthly" || rawPeriod === "quarterly" || rawPeriod === "yearly"
        ? rawPeriod
        : "daily";

    const consumption = await getFleetConsumptionSeries(period);

    return NextResponse.json({ consumption }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch consumption series";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
