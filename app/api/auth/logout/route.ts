// Revokes the current server-side session and clears its browser cookie.
import { NextRequest, NextResponse } from "next/server";
import { clearSession } from "@/lib/auth";
import { isSameOriginRequest } from "@/lib/auth-api";

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }
  const response = NextResponse.json({ ok: true });
  await clearSession(response);
  return response;
}
