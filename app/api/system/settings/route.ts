import { NextRequest, NextResponse } from "next/server";
import {
  getSystemSettings,
  isValidEmail,
  updateSystemSettings,
} from "@/features/system-capacity/service";
import { logApi } from "@/lib/api-log";

// Reads and updates system-wide settings (capacity + alarm notification email).
export async function GET() {
  try {
    const settings = await getSystemSettings();
    logApi("GET /api/system/settings → 200", { settings });
    return NextResponse.json(settings);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to load system settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body: unknown = await req.json();
    if (typeof body !== "object" || body === null) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const payload = body as {
      maxMeterCapacity?: unknown;
      alarmNotificationEmail?: unknown;
    };
    logApi("PATCH /api/system/settings", { body: payload });

    const hasCapacity = "maxMeterCapacity" in payload;
    const hasEmail = "alarmNotificationEmail" in payload;
    if (!hasCapacity && !hasEmail) {
      return NextResponse.json(
        { error: "Provide maxMeterCapacity and/or alarmNotificationEmail" },
        { status: 400 },
      );
    }

    const update: {
      maxMeterCapacity?: number | null;
      alarmNotificationEmail?: string | null;
    } = {};

    if (hasCapacity) {
      const maxMeterCapacity = payload.maxMeterCapacity;
      if (
        maxMeterCapacity !== null &&
        (!Number.isInteger(maxMeterCapacity) || (maxMeterCapacity as number) < 0)
      ) {
        return NextResponse.json(
          { error: "maxMeterCapacity must be a non-negative whole number or null" },
          { status: 400 },
        );
      }
      update.maxMeterCapacity = maxMeterCapacity as number | null;
    }

    if (hasEmail) {
      const raw = payload.alarmNotificationEmail;
      if (raw !== null && typeof raw !== "string") {
        return NextResponse.json(
          { error: "alarmNotificationEmail must be a string or null" },
          { status: 400 },
        );
      }
      const email = typeof raw === "string" ? raw.trim() : null;
      if (email && !isValidEmail(email)) {
        return NextResponse.json(
          { error: "alarmNotificationEmail must be a valid email address" },
          { status: 400 },
        );
      }
      update.alarmNotificationEmail = email;
    }

    const settings = await updateSystemSettings(update);
    logApi("PATCH /api/system/settings → 200", { update });
    return NextResponse.json(settings);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to update system settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
