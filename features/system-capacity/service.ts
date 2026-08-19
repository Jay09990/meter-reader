import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export interface CapacityStatus {
  maxCapacity: number | null;
  currentCount: number;
  atCapacity: boolean;
  unacknowledgedRejections: { count: number; mostRecent: { deviceSerialNo: string; attemptedAt: Date } | null } | null;
}

// Uses SQL until the local Prisma client is regenerated with the new models.
export async function getCapacityStatus(): Promise<CapacityStatus> {
  const [settings, currentCount, rejections] = await Promise.all([
    db.$queryRaw<Array<{ maxMeterCapacity: number | null }>>(Prisma.sql`SELECT "maxMeterCapacity" FROM "SystemSettings" WHERE "id" = 'singleton'`),
    db.device.count(),
    db.$queryRaw<Array<{ count: bigint; deviceSerialNo: string | null; attemptedAt: Date | null }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS "count",
        (SELECT "deviceSerialNo" FROM "RejectedConnectionAttempt" WHERE "acknowledged" = false ORDER BY "attemptedAt" DESC LIMIT 1) AS "deviceSerialNo",
        (SELECT "attemptedAt" FROM "RejectedConnectionAttempt" WHERE "acknowledged" = false ORDER BY "attemptedAt" DESC LIMIT 1) AS "attemptedAt"
      FROM "RejectedConnectionAttempt" WHERE "acknowledged" = false`),
  ]);
  const maxCapacity = settings[0]?.maxMeterCapacity ?? null;
  const rejection = rejections[0];
  const rejectionCount = Number(rejection?.count ?? 0);
  return {
    maxCapacity,
    currentCount,
    atCapacity: maxCapacity !== null && currentCount >= maxCapacity,
    unacknowledgedRejections: rejectionCount ? { count: rejectionCount, mostRecent: rejection.deviceSerialNo && rejection.attemptedAt ? { deviceSerialNo: rejection.deviceSerialNo, attemptedAt: rejection.attemptedAt } : null } : null,
  };
}

export async function getMaxMeterCapacity() {
  const settings = await db.$queryRaw<Array<{ maxMeterCapacity: number | null }>>(Prisma.sql`SELECT "maxMeterCapacity" FROM "SystemSettings" WHERE "id" = 'singleton'`);
  return settings[0]?.maxMeterCapacity ?? null;
}

export async function setMaxMeterCapacity(maxMeterCapacity: number | null) {
  await db.$executeRaw(Prisma.sql`INSERT INTO "SystemSettings" ("id", "maxMeterCapacity", "updatedAt") VALUES ('singleton', ${maxMeterCapacity}, NOW()) ON CONFLICT ("id") DO UPDATE SET "maxMeterCapacity" = EXCLUDED."maxMeterCapacity", "updatedAt" = NOW()`);
  return maxMeterCapacity;
}

export async function recordRejectedConnection(deviceSerialNo: string, rawPayload: unknown) {
  await db.$executeRaw(Prisma.sql`INSERT INTO "RejectedConnectionAttempt" ("id", "deviceSerialNo", "rawPayload") VALUES (${crypto.randomUUID()}, ${deviceSerialNo}, ${JSON.stringify(rawPayload)}::jsonb)`);
}

export async function acknowledgeRejectedConnections() {
  return db.$executeRaw(Prisma.sql`UPDATE "RejectedConnectionAttempt" SET "acknowledged" = true WHERE "acknowledged" = false`);
}
