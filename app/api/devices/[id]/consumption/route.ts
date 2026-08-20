import { NextRequest, NextResponse } from "next/server";
import { getDeviceConsumptionSeries } from "@/features/devices";
import type { ConsumptionMode } from "@/lib/consumption-series";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const rawPeriod = request.nextUrl.searchParams.get("period");
    const period: ConsumptionMode = rawPeriod === "monthly" || rawPeriod === "quarterly" || rawPeriod === "yearly" ? rawPeriod : "daily";
    return NextResponse.json({ consumption: await getDeviceConsumptionSeries(id, period) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to fetch consumption" }, { status: 500 });
  }
}
