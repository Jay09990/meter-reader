import { notifyAlarmCreated } from "../features/alarms/notify";
import { PrismaClient } from "@prisma/client";

async function main() {
  const db = new PrismaClient();

  console.log("--- Preflight ---");
  console.log("API key:", process.env.RESEND_API_KEY ? "present" : "MISSING");
  console.log(
    "Template ID:",
    process.env.RESEND_ALARM_TEMPLATE_ID || "d96fdd0c-6ca6-49ca-87c3-9e39708aa350",
  );
  console.log("FROM env:", process.env.RESEND_FROM_EMAIL || "(none)");

  const settings = await db.systemSettings.findUnique({ where: { id: "singleton" } });
  console.log("alarmNotificationEmail:", settings?.alarmNotificationEmail ?? "(not set)");

  if (!settings?.alarmNotificationEmail) {
    throw new Error(
      "Set a notification email on System Settings (/dashboard/settings) first.",
    );
  }

  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is missing from .env");
  }

  // Gmail (and most personal) addresses cannot be used as Resend From without a verified domain.
  // Prefer onboarding@resend.dev for sandbox tests.
  const from = process.env.RESEND_FROM_EMAIL?.trim() || "";
  if (from && /@(gmail|yahoo|outlook|hotmail)\./i.test(from)) {
    console.warn(
      `\nWARNING: RESEND_FROM_EMAIL="${from}" looks like a personal inbox.\n` +
        `Resend usually requires a verified domain (or onboarding@resend.dev) as From.\n` +
        `Overriding to "AMR Alerts <onboarding@resend.dev>" for this test.\n`,
    );
    process.env.RESEND_FROM_EMAIL = "AMR Alerts <onboarding@resend.dev>";
  }

  console.log("\n--- Sending test alarm email ---");
  await notifyAlarmCreated({
    deviceSerialNo: "EVC-TEST-001",
    type: "PRESSURE_OUT_OF_RANGE",
    severity: "CRITICAL",
    cause:
      "Test alarm from scripts/test-alarm-email.ts — gas pressure reading of 45 bar exceeded the configured upper threshold of 40 bar for meter EVC-TEST-001.",
    forDate: new Date(),
    meterSerialNo: "MTR-TEST-001",
    customerName: "Test Customer Pvt Ltd",
    gaName: "Test Geographical Area",
    measuredValue: 45,
    unit: "bar",
    thresholdValue: 40,
    thresholdDirection: "above",
  });

  console.log("Done. Check inbox + Resend dashboard → Emails.");
  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
