import { NextResponse } from "next/server";
import { getFleetConsumptionSeries } from "@/features/overview/service";
import type { ConsumptionMode } from "@/lib/consumption-series";
import { logApi } from "@/lib/api-log";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawPeriod = searchParams.get("period") ?? "daily";
    const period: ConsumptionMode =
      rawPeriod === "monthly" || rawPeriod === "quarterly" || rawPeriod === "yearly"
        ? rawPeriod
        : "daily";

    logApi("GET /api/overview/consumption", { period });
    const consumption = await getFleetConsumptionSeries(period);

    logApi("GET /api/overview/consumption → 200", { period, points: consumption.length });
    return NextResponse.json({ consumption }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch consumption series";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
