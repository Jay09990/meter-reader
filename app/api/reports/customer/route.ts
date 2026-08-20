import { NextRequest, NextResponse } from "next/server";
import {
  getCustomerReport,
  ReportNotFoundError,
  ReportValidationError,
  FREQUENCY_OPTIONS,
  DataFrequency,
} from "@/features/reports";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const customerId = searchParams.get("customerId") || "";
  const startDate = searchParams.get("startDate") || "";
  const endDate = searchParams.get("endDate") || "";
  const frequency = (searchParams.get("frequency") || "1h") as DataFrequency;

  // Validate frequency
  const isValidFreq = FREQUENCY_OPTIONS.some(f => f.value === frequency);
  if (!isValidFreq) {
    return NextResponse.json({ error: "Invalid frequency parameter" }, { status: 400 });
  }

  try {
    const report = await getCustomerReport({ customerId, startDate, endDate, frequency });
    return NextResponse.json(report);
  } catch (err: unknown) {
    if (err instanceof ReportValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof ReportNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }

    // Don't leak raw DB/backend errors to the client — log for diagnostics
    // and return a generic, user-friendly message instead.
    console.error("Failed to generate customer report:", err);
    return NextResponse.json(
      { error: "Failed to generate the report. Please try again later." },
      { status: 500 },
    );
  }
}