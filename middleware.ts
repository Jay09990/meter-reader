import { NextRequest, NextResponse } from "next/server";

/**
 * Basic auth middleware — gates /dashboard/* routes behind a shared
 * username/password (HTTP Basic Auth). Suitable for an internal ops tool.
 *
 * Required env vars:
 *   DASHBOARD_USER     — defaults to "admin" if not set
 *   DASHBOARD_PASSWORD — if not set, auth is SKIPPED (dev convenience)
 *
 * To set up: add to .env
 *   DASHBOARD_USER=admin
 *   DASHBOARD_PASSWORD=changeme
 */
export function middleware(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;

  // No password configured → skip auth (dev mode)
  if (!password) return NextResponse.next();

  const expectedUser = process.env.DASHBOARD_USER ?? "admin";

  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Basic ")) {
    const encoded = authHeader.slice("Basic ".length);
    const decoded = Buffer.from(encoded, "base64").toString("utf-8");
    const [user, pass] = decoded.split(":", 2);
    if (user === expectedUser && pass === password) {
      return NextResponse.next();
    }
  }

  // Challenge
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="EVC Gas Dashboard"',
    },
  });
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
