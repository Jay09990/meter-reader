// Creates a GA-scoped account and starts a database-backed session.
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { hashPassword, makeRateLimitKey, createSession, setSessionCookie, takeRateLimit } from "@/lib/auth";
import { isSameOriginRequest } from "@/lib/auth-api";
import { EMAIL_MAX_LENGTH, PASSWORD_MAX_LENGTH, USERNAME_MAX_LENGTH, validateRegistrationFields } from "@/lib/auth-validation";

const MAX_REQUEST_BYTES = 4_096;
const REGISTRATION_LIMIT = 5;
const REGISTRATION_WINDOW_MS = 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }
  if (Number(request.headers.get("content-length") ?? 0) > MAX_REQUEST_BYTES) {
    return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  }

  const remoteAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const allowed = await takeRateLimit(
    makeRateLimitKey("register", remoteAddress, "all"),
    REGISTRATION_LIMIT,
    REGISTRATION_WINDOW_MS,
  );
  if (!allowed) {
    return NextResponse.json({ error: "Too many registration attempts. Try again later." }, { status: 429 });
  }

  let body: unknown;
  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_REQUEST_BYTES) {
      return NextResponse.json({ error: "Request is too large." }, { status: 413 });
    }
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Enter valid registration details." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Enter valid registration details." }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  if (
    typeof input.email !== "string" || input.email.length > EMAIL_MAX_LENGTH + 8 ||
    typeof input.username !== "string" || input.username.length > USERNAME_MAX_LENGTH + 8 ||
    typeof input.password !== "string" || input.password.length > PASSWORD_MAX_LENGTH ||
    typeof input.confirmPassword !== "string" || input.confirmPassword.length > PASSWORD_MAX_LENGTH ||
    typeof input.gaId !== "string"
  ) {
    return NextResponse.json({ error: "One or more fields are invalid." }, { status: 400 });
  }

  const { errors, email, username } = validateRegistrationFields({
    email: input.email,
    username: input.username,
    password: input.password,
    confirmPassword: input.confirmPassword,
    gaId: input.gaId,
  });
  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ error: "Please correct the highlighted fields.", fields: errors }, { status: 400 });
  }

  const ga = await db.geographicalArea.findUnique({ where: { id: input.gaId }, select: { id: true } });
  if (!ga) {
    return NextResponse.json({ error: "Select a valid geographical area." }, { status: 400 });
  }

  try {
    const passwordHash = await hashPassword(input.password);
    const token = await db.$transaction(async (transaction) => {
      const user = await transaction.user.create({
        data: { email, username, passwordHash, gaId: ga.id },
        select: { id: true },
      });
      return createSession(user.id, transaction);
    });
    const response = NextResponse.json({ ok: true }, { status: 201 });
    setSessionCookie(response, token);
    return response;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = Array.isArray(error.meta?.target) ? error.meta.target.map(String) : [];
      const field = target.some((value) => value.toLowerCase().includes("username")) ? "username" : "email";
      return NextResponse.json({ error: "That account detail is already registered.", fields: { [field]: field === "username" ? "This username is already taken." : "This email address is already registered." } }, { status: 409 });
    }
    console.error("Registration failed.", error);
    return NextResponse.json({ error: "Unable to create your account right now." }, { status: 500 });
  }
}
