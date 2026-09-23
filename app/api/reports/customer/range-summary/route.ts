import { NextRequest, NextResponse } from "next/server";
import {
  getCustomerRangeReport,
  ReportNotFoundError,
  ReportValidationError,
  RangeSelectorType,
} from "@/features/reports";
import { logApi } from "@/lib/api-log";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const customerId = searchParams.get("customerId") || "";
  const rangeType = (searchParams.get("rangeType") || "") as RangeSelectorType;
  const month = searchParams.get("month") || undefined;
  const fyStartYearStr = searchParams.get("fyStartYear");
  const quarterStr = searchParams.get("quarter");

  const fyStartYear = fyStartYearStr ? parseInt(fyStartYearStr, 10) : undefined;
  const quarter = quarterStr ? (parseInt(quarterStr, 10) as 1 | 2 | 3 | 4) : undefined;
  logApi("GET /api/reports/customer/range-summary", { customerId, rangeType, month, fyStartYear, quarter });

  try {
    const report = await getCustomerRangeReport({
      customerId,
      rangeType,
      month,
      fyStartYear,
      quarter,
    });
    logApi("GET /api/reports/customer/range-summary → 200", { customerId, rangeType });
    return NextResponse.json(report);
  } catch (err: unknown) {
    if (err instanceof ReportValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof ReportNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }

    console.error("Failed to generate range summary report:", err);
    return NextResponse.json(
      { error: "Failed to generate the range summary report. Please try again later." },
      { status: 500 },
    );
  }
}
