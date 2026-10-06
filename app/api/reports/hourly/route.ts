// Returns hourly consumption points for a selected customer and timestamp date range.
import { NextRequest, NextResponse } from "next/server";
import {
  getHourlyConsumptionReport,
  HourlyReportValidationError,
} from "@/features/reports";
import { logApi } from "@/lib/api-log";
import { getGaScope, requireApiUser, unauthorizedResponse } from "@/lib/auth-api";

export async function GET(request: NextRequest) {
  const user = await requireApiUser();
  if (!user) return unauthorizedResponse();

  const { searchParams } = new URL(request.url);
  const customerId = searchParams.get("customerId") || "";
  const startDate = searchParams.get("startDate") || "";
  const endDate = searchParams.get("endDate") || "";
  logApi("GET /api/reports/hourly", { customerId, startDate, endDate });

  try {
    const report = await getHourlyConsumptionReport({
      customerId,
      startDate,
      endDate,
      gaId: getGaScope(user),
    });
    logApi("GET /api/reports/hourly → 200", { rows: report.rows.length });
    return NextResponse.json(report);
  } catch (error) {
    if (error instanceof HourlyReportValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Failed to generate hourly consumption report:", error);
    return NextResponse.json(
      { error: "Failed to generate the hourly report. Please try again later." },
      { status: 500 },
    );
  }
}
