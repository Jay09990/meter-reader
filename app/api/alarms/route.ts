import { NextRequest, NextResponse } from "next/server";
import { getPaginatedAlarms } from "@/features/alarms";
import { AlarmStatus, AlarmType, AlarmSeverity } from "@prisma/client";
import { logApi } from "@/lib/api-log";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "10", 10);
    const statusParam = searchParams.get("status");
    const typeParam = searchParams.get("type");

    const status = statusParam && Object.values(AlarmStatus).includes(statusParam as AlarmStatus)
      ? (statusParam as AlarmStatus)
      : undefined;

    const type = typeParam && Object.values(AlarmType).includes(typeParam as AlarmType)
      ? (typeParam as AlarmType)
      : undefined;

    const severityParam = searchParams.get("severity");
    const severity = severityParam && Object.values(AlarmSeverity).includes(severityParam as AlarmSeverity)
      ? (severityParam as AlarmSeverity)
      : undefined;

    const search = searchParams.get("search") || undefined;
    const acknowledgedParam = searchParams.get("acknowledged");
    const acknowledged =
      acknowledgedParam === "true"
        ? true
        : acknowledgedParam === "false"
          ? false
          : undefined;

    logApi("GET /api/alarms", { page, limit, status, type, severity, search, acknowledged });
    const result = await getPaginatedAlarms({ page, limit, status, type, severity, search, acknowledged });
    logApi("GET /api/alarms → 200", { totalCount: result.pagination.totalCount, returned: result.items.length });
    return NextResponse.json(result, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch alarms";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
