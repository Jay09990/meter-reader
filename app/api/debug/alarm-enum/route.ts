import { AlarmType } from "@prisma/client";
import { NextResponse } from "next/server";
import { logApi } from "@/lib/api-log";

export async function GET() {
  const types = Object.values(AlarmType);
  logApi("GET /api/debug/alarm-enum → 200", { count: types.length });
  return NextResponse.json({
    knownByDeployedClient: types,
  });
}