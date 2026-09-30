// Shared API guards and same-origin checks for browser session endpoints.
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export async function requireApiUser() {
  return getCurrentUser();
}

export async function requireAdminUser() {
  const user = await getCurrentUser();
  return user?.role === "ADMIN" ? user : null;
}

// An omitted GA filter is reserved for trusted administrators with cross-GA access.
export function getGaScope(user: { gaId: string; role: string }): string | undefined {
  return user.role === "ADMIN" ? undefined : user.gaId;
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: "Authentication required" }, { status: 401 });
}

export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    const originUrl = new URL(origin);
    const forwardedHost = request.headers.get("x-forwarded-host");
    const requestHost = forwardedHost?.split(",")[0]?.trim() || request.headers.get("host");
    return Boolean(requestHost && originUrl.host === requestHost);
  } catch {
    return false;
  }
}
