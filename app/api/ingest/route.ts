import { after, NextRequest, NextResponse } from "next/server";
import { processIngestPayload } from "@/features/ingest";
import { logApi } from "@/lib/api-log";

const MAX_INGEST_BODY_BYTES = 1_048_576;

export async function POST(req: NextRequest) {
  try {
    // Secret verification (if configured in env)
    const expectedSecret = process.env.INGESTION_SECRET;
    if (process.env.NODE_ENV === "production" && !expectedSecret) {
      return NextResponse.json({ error: "Ingestion authentication is not configured." }, { status: 503 });
    }
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

    const declaredLength = Number(req.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_INGEST_BODY_BYTES) {
      return NextResponse.json({ error: "Ingestion payload is too large." }, { status: 413 });
    }

    let rawBody: string;
    try {
      rawBody = await req.text();
      logApi("POST /api/ingest received");
    } catch {
      return NextResponse.json(
        { error: "Unable to read ingestion request body." },
        { status: 400 },
      );
    }
    if (Buffer.byteLength(rawBody, "utf8") > MAX_INGEST_BODY_BYTES) {
      return NextResponse.json({ error: "Ingestion payload is too large." }, { status: 413 });
    }

    after(async () => {
      try {
        const body: unknown = JSON.parse(rawBody);
        const result = await processIngestPayload(body);
        logApi("POST /api/ingest processed", { result });
      } catch (error) {
        logApi("POST /api/ingest background processing failed", {
          error: error instanceof Error ? error.message : "Unknown ingestion processing failure",
        });
      }
    });
    logApi("POST /api/ingest accepted for background processing");
    return NextResponse.json(
      { success: true, accepted: true, message: "Ingestion accepted for processing." },
      { status: 202 },
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unable to accept ingestion request." },
      { status: 500 },
    );
  }
}
