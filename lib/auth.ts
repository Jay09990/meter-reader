// Server-only password, session, and rate-limit helpers for the app's local auth flow.
import "server-only";
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { SESSION_COOKIE_NAME } from "@/lib/auth-constants";

const SESSION_LIFETIME_SECONDS = 60 * 60 * 24 * 7;
const SCRYPT_COST = 32_768;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;

export interface AuthenticatedUser {
  id: string;
  email: string;
  username: string;
  gaId: string;
  gaName: string;
  role: "USER" | "ADMIN";
}

function derivePasswordKey(password: string, salt: Buffer, keyLength: number, options: { N: number; r: number; p: number; maxmem: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey as Buffer);
    });
  });
}

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = await derivePasswordKey(password, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
    maxmem: SCRYPT_MAX_MEMORY,
  });

  return `scrypt$${SCRYPT_COST}$${SCRYPT_BLOCK_SIZE}$${SCRYPT_PARALLELIZATION}$${salt.toString("hex")}$${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [algorithm, cost, blockSize, parallelization, saltHex, expectedHex] = storedHash.split("$");
  if (algorithm !== "scrypt" || !cost || !blockSize || !parallelization || !saltHex || !expectedHex) {
    return false;
  }

  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(expectedHex, "hex");
  if (salt.length !== 16 || expected.length !== SCRYPT_KEY_LENGTH) return false;

  try {
    const actual = await derivePasswordKey(password, salt, expected.length, {
      N: Number(cost),
      r: Number(blockSize),
      p: Number(parallelization),
      maxmem: SCRYPT_MAX_MEMORY,
    });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export async function createSession(
  userId: string,
  client: Prisma.TransactionClient | typeof db = db,
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_SECONDS * 1000);

  await client.authSession.create({
    data: { tokenHash: hashSessionToken(token), userId, expiresAt },
  });
  return token;
}

export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_LIFETIME_SECONDS,
  });
}

export async function clearSession(response: NextResponse): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    await db.authSession.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
  }
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token || token.length > 128) return null;

  const session = await db.authSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    select: {
      expiresAt: true,
      user: {
        select: {
          id: true,
          email: true,
          username: true,
          gaId: true,
          role: true,
          ga: { select: { name: true } },
        },
      },
    },
  });
  if (!session || session.expiresAt <= new Date()) return null;

  return { ...session.user, gaName: session.user.ga.name };
}

export async function takeRateLimit(key: string, maxAttempts: number, windowMs: number): Promise<boolean> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - windowMs);
  const [bucket] = await db.$queryRaw<Array<{ attempts: number }>>(Prisma.sql`
    INSERT INTO "AuthRateLimit" ("key", "attempts", "windowStart", "updatedAt")
    VALUES (${key}, 1, ${now}, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "attempts" = CASE WHEN "AuthRateLimit"."windowStart" <= ${cutoff} THEN 1 ELSE "AuthRateLimit"."attempts" + 1 END,
      "windowStart" = CASE WHEN "AuthRateLimit"."windowStart" <= ${cutoff} THEN ${now} ELSE "AuthRateLimit"."windowStart" END,
      "updatedAt" = ${now}
    RETURNING "attempts"
  `);
  return bucket.attempts <= maxAttempts;
}

export function makeRateLimitKey(namespace: string, remoteAddress: string, identity: string): string {
  return createHash("sha256").update(`${namespace}:${remoteAddress}:${identity}`).digest("hex");
}
