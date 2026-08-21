import { Resend } from "resend";
import { getAlarmNotificationEmail } from "@/features/system-capacity/service";

export interface AlarmNotificationPayload {
  deviceSerialNo: string;
  type: string;
  severity: string;
  cause: string;
  forDate: Date;
  /** Optional enrichment fields — used to fill out the full Resend template. */
  meterSerialNo?: string | null;
  customerName?: string | null;
  gaName?: string | null;
  measuredValue?: number | string | null;
  unit?: string | null;
  thresholdValue?: number | string | null;
  thresholdDirection?: string | null;
}

/** Published Resend template used for structured alarm emails. */
const DEFAULT_ALARM_TEMPLATE_ID = "d96fdd0c-6ca6-49ca-87c3-9e39708aa350";

/** Default destination for the "View alarm in dashboard" button in the email template. */
const DEFAULT_ALARM_DASHBOARD_URL =
  "https://amrdemo-cgd.altrextech.com/dashboard/alarms";

/** Default company name shown in the email template header. */
const DEFAULT_COMPANY_NAME = "AMR Gas Metering";

function getAlarmDashboardUrl(): string {
  return (
    process.env.ALARM_DASHBOARD_URL?.trim() || DEFAULT_ALARM_DASHBOARD_URL
  );
}

function getCompanyName(): string {
  return process.env.ALARM_COMPANY_NAME?.trim() || DEFAULT_COMPANY_NAME;
}

type TemplateVariableDef = { key: string; type: "string" | "number" };

type CachedTemplate = {
  id: string;
  subject: string | null;
  from: string | null;
  variables: TemplateVariableDef[];
  fetchedAt: number;
};

const TEMPLATE_CACHE_TTL_MS = 5 * 60 * 1000;
let templateCache: CachedTemplate | null = null;

function formatAlarmType(type: string): string {
  return type
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeKey(key: string): string {
  return key.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

/**
 * Canonical variable payload matching the exact (camelCase) keys declared by
 * the published Resend template. Used directly when templates.get is
 * unavailable (send-only API keys) or returns no declared variables, and as
 * the source of truth that buildTemplateVariables() maps onto whatever keys
 * templates.get *does* report.
 */
function canonicalVariables(
  payload: AlarmNotificationPayload,
): Record<string, string> {
  const typeLabel = formatAlarmType(payload.type);
  const forDate = payload.forDate.toISOString().split("T")[0];
  const dashboardUrl = getAlarmDashboardUrl();
  const measuredValue =
    payload.measuredValue !== undefined && payload.measuredValue !== null
      ? String(payload.measuredValue)
      : "";
  const thresholdValue =
    payload.thresholdValue !== undefined && payload.thresholdValue !== null
      ? String(payload.thresholdValue)
      : "";
  return {
    companyName: getCompanyName(),
    cause: payload.cause,
    deviceSerialNo: payload.deviceSerialNo,
    meterSerialNo: payload.meterSerialNo || payload.deviceSerialNo,
    customerName: payload.customerName || "—",
    gaName: payload.gaName || "—",
    alarmTypeLabel: typeLabel,
    measuredValue,
    unit: payload.unit || "",
    thresholdValue,
    thresholdDirection: payload.thresholdDirection || "",
    forDate,
    // Legacy/alternate aliases kept for compatibility with older template revisions.
    ALARM_TYPE: typeLabel,
    SEVERITY: payload.severity,
    DEVICE_SERIAL_NO: payload.deviceSerialNo,
    METER_ID: payload.deviceSerialNo,
    CAUSE: payload.cause,
    FOR_DATE: forDate,
    // Button / CTA link in the Resend template ("View alarm in dashboard")
    DASHBOARD_URL: dashboardUrl,
    ALARM_URL: dashboardUrl,
    VIEW_ALARM_URL: dashboardUrl,
    CTA_LINK: dashboardUrl,
    CTA_URL: dashboardUrl,
    BUTTON_URL: dashboardUrl,
    LINK: dashboardUrl,
    dashboardUrl,
    alarmUrl: dashboardUrl,
    viewAlarmUrl: dashboardUrl,
    ctaLink: dashboardUrl,
    ctaUrl: dashboardUrl,
    buttonUrl: dashboardUrl,
    link: dashboardUrl,
  };
}

/**
 * Maps alarm payload fields onto whatever variable keys the Resend template
 * declares (discovered via templates.get). Matching is case/separator-insensitive.
 *
 * FIXED: previously, when templates.get() returned a non-empty declared
 * `variables` list, this function returned ONLY the keys that successfully
 * matched — anything that didn't match a declared key/alias was silently
 * dropped, which meant a single naming mismatch on Resend's side could blank
 * out the entire email with no error anywhere. Now it starts from the full
 * canonical set (guaranteed complete) and only overlays the declared-key
 * mapping on top — a mismatch degrades to "canonical name used instead" per
 * field, not "field vanishes."
 */
function buildTemplateVariables(
  payload: AlarmNotificationPayload,
  templateVars: TemplateVariableDef[],
): Record<string, string | number> {
  const canonical = canonicalVariables(payload);

  const valueByNormalizedKey: Record<string, string> = {};
  for (const [key, value] of Object.entries(canonical)) {
    valueByNormalizedKey[normalizeKey(key)] = value;
  }

  // Extra aliases
  valueByNormalizedKey.ALERT_TYPE = valueByNormalizedKey.ALARM_TYPE;
  valueByNormalizedKey.ALERT_TYPE_LABEL = valueByNormalizedKey.ALARM_TYPE;
  valueByNormalizedKey.DEVICE_SERIAL = valueByNormalizedKey.DEVICE_SERIAL_NO;
  valueByNormalizedKey.DEVICE_ID = valueByNormalizedKey.DEVICE_SERIAL_NO;
  valueByNormalizedKey.METER = normalizeKey("meterSerialNo") in valueByNormalizedKey
    ? valueByNormalizedKey[normalizeKey("meterSerialNo")]
    : valueByNormalizedKey.DEVICE_SERIAL_NO;
  valueByNormalizedKey.METER_ID_ALIAS = valueByNormalizedKey.METER_ID;
  valueByNormalizedKey.DESCRIPTION = valueByNormalizedKey.CAUSE;
  valueByNormalizedKey.REASON = valueByNormalizedKey.CAUSE;
  valueByNormalizedKey.ALARM_DATE = valueByNormalizedKey.FOR_DATE;
  valueByNormalizedKey.COMPANY = valueByNormalizedKey.COMPANY_NAME;
  valueByNormalizedKey.CUSTOMER = valueByNormalizedKey.CUSTOMER_NAME;
  valueByNormalizedKey.GA = valueByNormalizedKey.GA_NAME;
  valueByNormalizedKey.GEOGRAPHICAL_AREA = valueByNormalizedKey.GA_NAME;
  valueByNormalizedKey.AREA_NAME = valueByNormalizedKey.GA_NAME;
  valueByNormalizedKey.VALUE = valueByNormalizedKey.MEASURED_VALUE;
  valueByNormalizedKey.THRESHOLD = valueByNormalizedKey.THRESHOLD_VALUE;
  valueByNormalizedKey.DIRECTION = valueByNormalizedKey.THRESHOLD_DIRECTION;
  valueByNormalizedKey.VIEW_IN_DASHBOARD = valueByNormalizedKey.DASHBOARD_URL;
  valueByNormalizedKey.VIEW_ALARM = valueByNormalizedKey.DASHBOARD_URL;
  valueByNormalizedKey.ACTION_URL = valueByNormalizedKey.DASHBOARD_URL;

  if (templateVars.length === 0) {
    return canonical;
  }

  // CHANGED: start from the full canonical payload (every field guaranteed
  // present, matching the exact camelCase names used in the template body),
  // then overlay whatever the declared-variable mapping successfully
  // resolves. A declared key that fails to match just means "canonical
  // value stands," never "field disappears."
  const variables: Record<string, string | number> = { ...canonical };
  for (const def of templateVars) {
    const matched = valueByNormalizedKey[normalizeKey(def.key)];
    if (matched === undefined) continue;
    variables[def.key] = def.type === "number" ? Number(matched) || 0 : matched;
  }
  return variables;
}

async function loadAlarmTemplate(
  resend: Resend,
  templateId: string,
): Promise<CachedTemplate | null> {
  const now = Date.now();
  if (
    templateCache &&
    templateCache.id === templateId &&
    now - templateCache.fetchedAt < TEMPLATE_CACHE_TTL_MS
  ) {
    return templateCache;
  }

  const { data, error } = await resend.templates.get(templateId);
  if (error || !data) {
    // Send-only API keys cannot call templates.get — fall back to known variables.
    console.warn(
      "[ALARM NOTIFICATION] templates.get unavailable; sending with canonical variables.",
      error?.message ?? error,
    );
    return null;
  }

  if (data.status !== "published") {
    throw new Error(
      `Resend template ${templateId} is "${data.status}" — publish it before sending alarms.`,
    );
  }

  templateCache = {
    id: data.id,
    subject: data.subject,
    from: data.from,
    variables: (data.variables ?? []).map((v) => ({
      key: v.key,
      type: v.type,
    })),
    fetchedAt: now,
  };
  return templateCache;
}

/**
 * Sends an email via a Resend template when a new alarm is created.
 * Tries templates.get so variables match the dashboard definition; if the API key
 * is send-only, falls back to canonical variable names.
 * Never throws — alarm creation must not fail because email delivery failed.
 */
export async function notifyAlarmCreated(
  payload: AlarmNotificationPayload,
): Promise<void> {
  try {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) {
      console.warn(
        "[ALARM NOTIFICATION] RESEND_API_KEY is not set; skipping email.",
      );
      return;
    }

    const to = await getAlarmNotificationEmail();
    if (!to) {
      console.warn(
        "[ALARM NOTIFICATION] No alarmNotificationEmail configured in System Settings; skipping email.",
      );
      return;
    }

    const templateId =
      process.env.RESEND_ALARM_TEMPLATE_ID?.trim() || DEFAULT_ALARM_TEMPLATE_ID;
    const resend = new Resend(apiKey);
    const template = await loadAlarmTemplate(resend, templateId);

    // TEMP DIAGNOSTIC — delete once the variable-matching issue is confirmed
    // fixed. This prints exactly what Resend's dashboard declared as this
    // template's variables (name + type), so you can see directly whether
    // those keys line up with the {{...}} tags in the template body.
    console.log(
      "[ALARM NOTIFICATION][DEBUG] Resend-declared template variables:",
      JSON.stringify(template?.variables ?? "NONE (templates.get returned no data, or failed — check the warning above)"),
    );

    const variables = buildTemplateVariables(
      payload,
      template?.variables ?? [],
    );

    // TEMP DIAGNOSTIC — delete alongside the block above.
    console.log(
      "[ALARM NOTIFICATION][DEBUG] Final variables object sent to Resend:",
      JSON.stringify(variables),
    );

    const typeLabel = formatAlarmType(payload.type);

    const from =
      process.env.RESEND_FROM_EMAIL?.trim() ||
      template?.from ||
      "AMR Alerts <onboarding@resend.dev>";

    const subject =
      template?.subject ||
      `[${payload.severity}] ${typeLabel} — ${payload.deviceSerialNo}`;

    const { data, error } = await resend.emails.send({
      from,
      to: [to],
      subject,
      template: {
        id: templateId,
        variables,
      },
    });

    if (error) {
      console.error("[ALARM NOTIFICATION] Resend error:", error);
      return;
    }

    console.log(
      `[ALARM NOTIFICATION] Sent ${payload.type} for ${payload.deviceSerialNo} to ${to} via template ${templateId}` +
        (data?.id ? ` (id=${data.id})` : ""),
    );
  } catch (err) {
    console.error("[ALARM NOTIFICATION] Failed to send email:", err);
  }
}