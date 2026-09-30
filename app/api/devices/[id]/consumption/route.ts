import { NextRequest, NextResponse } from "next/server";
import { getDeviceConsumptionSeries, getDeviceConsumptionSeriesUncorrected } from "@/features/devices";
import type { ConsumptionMode } from "@/lib/consumption-series";
import { logApi } from "@/lib/api-log";
import { getGaScope, requireApiUser, unauthorizedResponse } from "@/lib/auth-api";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser();
    if (!user) return unauthorizedResponse();
    const { id } = await params;
    const rawPeriod = request.nextUrl.searchParams.get("period");
    const period: ConsumptionMode = rawPeriod === "monthly" || rawPeriod === "quarterly" || rawPeriod === "yearly" ? rawPeriod : "daily";
    logApi("GET /api/devices/[id]/consumption", { id, period });

    // Compute both series in parallel — same boundary-reading pattern,
    // correctedVolumeVb for 'consumption', uncorrectedVolumeVm for 'uncorrectedConsumption'.
    const [consumption, uncorrectedConsumption] = await Promise.all([
      getDeviceConsumptionSeries(id, period, getGaScope(user)),
      getDeviceConsumptionSeriesUncorrected(id, period, getGaScope(user)),
    ]);

    logApi("GET /api/devices/[id]/consumption → 200", { id, period, correctedPoints: consumption.length, uncorrectedPoints: uncorrectedConsumption.length });
    return NextResponse.json({ consumption, uncorrectedConsumption });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to fetch consumption" }, { status: 500 });
  }
}
