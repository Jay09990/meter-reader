import { NextResponse } from "next/server";
import { getFleetAnalytics, getFleetOverview } from "@/features/overview/service";
import type { KpiRange } from "@/features/overview/service";
import { logApi } from "@/lib/api-log";
import { getGaScope, requireApiUser, unauthorizedResponse } from "@/lib/auth-api";

export async function GET(request: Request) {
  try {
    const user = await requireApiUser();
    if (!user) return unauthorizedResponse();
    const { searchParams } = new URL(request.url);
    const rawRange = searchParams.get("range") ?? "today";
    const range: KpiRange =
      rawRange === "month" || rawRange === "quarter" || rawRange === "year" ? rawRange : "today";

    logApi("GET /api/overview", { range });

    const [overview, analytics] = await Promise.all([
      getFleetOverview(getGaScope(user)),
      getFleetAnalytics(range, getGaScope(user)),
    ]);

    logApi("GET /api/overview → 200", { range });
    return NextResponse.json({
      ...overview,
      ...analytics,
    }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch AMR overview";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
