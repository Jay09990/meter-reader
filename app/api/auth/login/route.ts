// Validates username/email credentials and rotates to a fresh session token.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSession, hashPassword, makeRateLimitKey, setSessionCookie, takeRateLimit, verifyPassword } from "@/lib/auth";
import { isSameOriginRequest } from "@/lib/auth-api";
import { normalizeEmail, normalizeUsername, PASSWORD_MAX_LENGTH } from "@/lib/auth-validation";

const MAX_REQUEST_BYTES = 2_048;
const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  let body: unknown;
  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_REQUEST_BYTES) {
      return NextResponse.json({ error: "Request is too large." }, { status: 413 });
    }
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Enter valid sign-in details." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Enter valid sign-in details." }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  if (
    typeof input.identifier !== "string" || input.identifier.length > 254 ||
    typeof input.password !== "string" || input.password.length > PASSWORD_MAX_LENGTH
  ) {
    return NextResponse.json({ error: "Enter a username or email and a password." }, { status: 400 });
  }

  const identifier = input.identifier.trim().toLowerCase();
  if (!identifier || !input.password) {
    return NextResponse.json({ error: "Enter a username or email and a password." }, { status: 400 });
  }

  const remoteAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const ipAllowed = await takeRateLimit(
    makeRateLimitKey("login-ip", remoteAddress, "all"),
    30,
    LOGIN_WINDOW_MS,
  );
  if (!ipAllowed) {
    return NextResponse.json({ error: "Too many sign-in attempts. Try again in 15 minutes." }, { status: 429 });
  }
  const identityAllowed = await takeRateLimit(
    makeRateLimitKey("login-identity", "all", identifier),
    15,
    LOGIN_WINDOW_MS,
  );
  if (!identityAllowed) {
    return NextResponse.json({ error: "Too many sign-in attempts for this account. Try again in 15 minutes." }, { status: 429 });
  }
  const allowed = await takeRateLimit(
    makeRateLimitKey("login", remoteAddress, identifier),
    LOGIN_LIMIT,
    LOGIN_WINDOW_MS,
  );
  if (!allowed) {
    return NextResponse.json({ error: "Too many sign-in attempts. Try again in 15 minutes." }, { status: 429 });
  }

  const user = await db.user.findFirst({
    where: { OR: [{ username: normalizeUsername(identifier) }, { email: normalizeEmail(identifier) }] },
    select: { id: true, passwordHash: true },
  });

  // Do comparable password work for unknown usernames so the response is not an account-existence oracle.
  const passwordMatches = user
    ? await verifyPassword(input.password, user.passwordHash)
    : (await hashPassword("invalid-login-padding"), false);

  if (!user || !passwordMatches) {
    return NextResponse.json({ error: "Username/email or password is incorrect." }, { status: 401 });
  }

  const token = await createSession(user.id);
  const response = NextResponse.json({ ok: true });
  setSessionCookie(response, token);
  return response;
}
