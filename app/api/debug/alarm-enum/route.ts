import { AlarmType } from "@prisma/client";
import { NextResponse } from "next/server";
import { logApi } from "@/lib/api-log";
import { requireApiUser, unauthorizedResponse } from "@/lib/auth-api";

export async function GET() {
  const user = await requireApiUser();
  if (!user) return unauthorizedResponse();
  const types = Object.values(AlarmType);
  logApi("GET /api/debug/alarm-enum → 200", { count: types.length });
  return NextResponse.json({
    knownByDeployedClient: types,
  });
}
