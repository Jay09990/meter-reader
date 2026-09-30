// Returns only the identity and GA label needed by the signed-in interface.
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ user }, { headers: { "Cache-Control": "no-store" } });
}
