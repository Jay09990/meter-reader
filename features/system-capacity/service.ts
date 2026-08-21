import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export interface CapacityStatus {
  maxCapacity: number | null;
  currentCount: number;
  atCapacity: boolean;
  unacknowledgedRejections: {
    count: number;
    mostRecent: { deviceSerialNo: string; attemptedAt: Date } | null;
  } | null;
}

export interface SystemSettingsValues {
  maxMeterCapacity: number | null;
  alarmNotificationEmail: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value);
}

async function ensureSystemSettingsRow() {
  await db.systemSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton" },
    update: {},
  });
}

export async function getSystemSettings(): Promise<SystemSettingsValues> {
  await ensureSystemSettingsRow();
  const settings = await db.systemSettings.findUnique({ where: { id: "singleton" } });
  return {
    maxMeterCapacity: settings?.maxMeterCapacity ?? null,
    alarmNotificationEmail: settings?.alarmNotificationEmail ?? null,
  };
}

export async function updateSystemSettings(input: {
  maxMeterCapacity?: number | null;
  alarmNotificationEmail?: string | null;
}): Promise<SystemSettingsValues> {
  await ensureSystemSettingsRow();
  const data: {
    maxMeterCapacity?: number | null;
    alarmNotificationEmail?: string | null;
  } = {};
  if ("maxMeterCapacity" in input) data.maxMeterCapacity = input.maxMeterCapacity ?? null;
  if ("alarmNotificationEmail" in input) {
    data.alarmNotificationEmail = input.alarmNotificationEmail?.trim()
      ? input.alarmNotificationEmail.trim()
      : null;
  }
  const settings = await db.systemSettings.update({
    where: { id: "singleton" },
    data,
  });
  return {
    maxMeterCapacity: settings.maxMeterCapacity,
    alarmNotificationEmail: settings.alarmNotificationEmail,
  };
}

/** @deprecated Prefer getSystemSettings — kept for existing callers. */
export async function getMaxMeterCapacity() {
  const settings = await getSystemSettings();
  return settings.maxMeterCapacity;
}

/** @deprecated Prefer updateSystemSettings — kept for existing callers. */
export async function setMaxMeterCapacity(maxMeterCapacity: number | null) {
  const settings = await updateSystemSettings({ maxMeterCapacity });
  return settings.maxMeterCapacity;
}

export async function getAlarmNotificationEmail(): Promise<string | null> {
  const settings = await getSystemSettings();
  return settings.alarmNotificationEmail;
}

// Uses SQL until RejectedConnectionAttempt queries are fully migrated to the client API.
export async function getCapacityStatus(): Promise<CapacityStatus> {
  const [settings, currentCount, rejections] = await Promise.all([
    getSystemSettings(),
    db.device.count(),
    db.$queryRaw<
      Array<{ count: bigint; deviceSerialNo: string | null; attemptedAt: Date | null }>
    >(Prisma.sql`
      SELECT COUNT(*)::bigint AS "count",
        (SELECT "deviceSerialNo" FROM "RejectedConnectionAttempt" WHERE "acknowledged" = false ORDER BY "attemptedAt" DESC LIMIT 1) AS "deviceSerialNo",
        (SELECT "attemptedAt" FROM "RejectedConnectionAttempt" WHERE "acknowledged" = false ORDER BY "attemptedAt" DESC LIMIT 1) AS "attemptedAt"
      FROM "RejectedConnectionAttempt" WHERE "acknowledged" = false`),
  ]);
  const maxCapacity = settings.maxMeterCapacity;
  const rejection = rejections[0];
  const rejectionCount = Number(rejection?.count ?? 0);
  return {
    maxCapacity,
    currentCount,
    atCapacity: maxCapacity !== null && currentCount >= maxCapacity,
    unacknowledgedRejections: rejectionCount
      ? {
          count: rejectionCount,
          mostRecent:
            rejection.deviceSerialNo && rejection.attemptedAt
              ? {
                  deviceSerialNo: rejection.deviceSerialNo,
                  attemptedAt: rejection.attemptedAt,
                }
              : null,
        }
      : null,
  };
}

export async function recordRejectedConnection(deviceSerialNo: string, rawPayload: unknown) {
  await db.$executeRaw(
    Prisma.sql`INSERT INTO "RejectedConnectionAttempt" ("id", "deviceSerialNo", "rawPayload") VALUES (${crypto.randomUUID()}, ${deviceSerialNo}, ${JSON.stringify(rawPayload)}::jsonb)`,
  );
}

export async function acknowledgeRejectedConnections() {
  return db.$executeRaw(
    Prisma.sql`UPDATE "RejectedConnectionAttempt" SET "acknowledged" = true WHERE "acknowledged" = false`,
  );
}
