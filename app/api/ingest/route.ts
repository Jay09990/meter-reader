import { NextRequest, NextResponse } from "next/server";
import { CapacityExceededError, processIngestPayload } from "@/features/ingest";
import { logApi } from "@/lib/api-log";

export async function POST(req: NextRequest) {
  try {
    // Secret verification (if configured in env)
    const expectedSecret = process.env.INGESTION_SECRET;
    if (expectedSecret) {
      const providedSecret = req.headers.get("x-ingestion-secret");
      if (providedSecret !== expectedSecret) {
        logApi("POST /api/ingest → 401 invalid x-ingestion-secret");
        return NextResponse.json(
          { error: "Unauthorized: Invalid or missing x-ingestion-secret header" },
          { status: 401 }
        );
      }
    }

    let body: unknown;
    try {
      body = await req.json();
      logApi("POST /api/ingest", { body });
    } catch {
      return NextResponse.json(
        { error: "Bad Request: Request body must be valid JSON" },
        { status: 400 }
      );
    }

    const result = await processIngestPayload(body);
    logApi("POST /api/ingest → 200", { result });
    return NextResponse.json(result, { status: 200 });
  } catch (err: unknown) {
    if (err instanceof CapacityExceededError) {
      return NextResponse.json(
        { error: "MAX_METER_CAPACITY_REACHED", message: err.message },
        { status: 409 },
      );
    }
    const errorMessage = err instanceof Error ? err.message : "Ingestion processing failed";
    const isValidationError = errorMessage.startsWith("Invalid payload");
    
    return NextResponse.json(
      { error: errorMessage },
      { status: isValidationError ? 400 : 500 }
    );
  }
}
