import { NextRequest, NextResponse } from "next/server";
import { processIngestPayload } from "@/features/ingest";

export async function POST(req: NextRequest) {
  try {
    // Secret verification (if configured in env)
    const expectedSecret = process.env.INGESTION_SECRET;
    if (expectedSecret) {
      const providedSecret = req.headers.get("x-ingestion-secret");
      if (providedSecret !== expectedSecret) {
        return NextResponse.json(
          { error: "Unauthorized: Invalid or missing x-ingestion-secret header" },
          { status: 401 }
        );
      }
    }

    let body: unknown;
    try {
      body = await req.json();
      console.log("Incoming POST /api/ingest", { url: req.url, headers: Object.fromEntries(req.headers) });
      console.log("Ingest payload:", body);
    } catch {
      return NextResponse.json(
        { error: "Bad Request: Request body must be valid JSON" },
        { status: 400 }
      );
    }

    const result = await processIngestPayload(body);
    return NextResponse.json(result, { status: 200 });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Ingestion processing failed";
    const isValidationError = errorMessage.startsWith("Invalid payload");
    
    return NextResponse.json(
      { error: errorMessage },
      { status: isValidationError ? 400 : 500 }
    );
  }
}
