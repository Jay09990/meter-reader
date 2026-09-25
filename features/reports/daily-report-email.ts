import { Resend } from "resend";
import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { getSystemSettings } from "@/features/system-capacity/service";
import { getCustomerReport, type MeterReportGroup } from "@/features/reports/service";
import { buildCustomerReportWorkbook, sanitizeSheetName } from "@/lib/report-excel";

const DEFAULT_FROM = "AMR Reports <onboarding@resend.dev>";

/**
 * Sends a daily consumption report for all customers to the configured alarm
 * notification email. Called by the /api/cron/daily-report route each morning.
 *
 * Attaches the generated Excel file (.xlsx) with per-meter worksheets and
 * sends an executive summary email.
 *
 * @param forDateStr - ISO date string (YYYY-MM-DD) representing "yesterday".
 *                     The report covers one full day: forDate → forDate+1.
 */
export async function sendDailyReport(forDateStr: string): Promise<{
  sent: boolean;
  skipped?: string;
  emailId?: string;
  customersIncluded: number;
}> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { sent: false, skipped: "RESEND_API_KEY not configured", customersIncluded: 0 };
  }

  const settings = await getSystemSettings();
  const to = settings.alarmNotificationEmail;
  if (!to) {
    return { sent: false, skipped: "No alarmNotificationEmail configured", customersIncluded: 0 };
  }

  // Fetch all customers with their GA
  const customers = await db.customer.findMany({
    include: { ga: true },
    orderBy: [{ ga: { name: "asc" } }, { name: "asc" }],
  });

  if (customers.length === 0) {
    return { sent: false, skipped: "No customers in database", customersIncluded: 0 };
  }

  // Report window: forDate (day start) → next day
  const startDate = forDateStr;
  const endDateObj = new Date(forDateStr);
  endDateObj.setUTCDate(endDateObj.getUTCDate() + 1);
  const endDate = endDateObj.toISOString().split("T")[0];

  const allMeters: MeterReportGroup[] = [];
  let totalMetersCount = 0;
  let totalCorrectedConsumption = 0;
  let totalUncorrectedConsumption = 0;
  let customersWithDataCount = 0;

  for (const customer of customers) {
    try {
      const report = await getCustomerReport({
        customerId: customer.id,
        startDate,
        endDate,
        frequency: "1d",
      });

      if (report.meters.length > 0) {
        customersWithDataCount++;
        totalMetersCount += report.meters.length;
        allMeters.push(...report.meters);

        for (const r of report.readings) {
          totalCorrectedConsumption += r.consumption ?? 0;
          totalUncorrectedConsumption += r.uncorrectedConsumption ?? 0;
        }
      }
    } catch {
      // Skip customers with error
    }
  }

  // Build Excel workbook
  // Build Excel workbook
  let workbook: ExcelJS.Workbook;
  if (allMeters.length > 0) {
    workbook = buildCustomerReportWorkbook(allMeters);
  } else {
    workbook = new ExcelJS.Workbook();
    const sheetName = sanitizeSheetName("Summary", "Summary", new Set());
    const sheet = workbook.addWorksheet(sheetName);
    sheet.addRow(["Status"]);
    sheet.addRow([`No meter data recorded for date ${forDateStr}`]);
  }

  // Write Excel file into a Node Buffer

  // Write Excel file into a Node Buffer
  const excelBuffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const attachmentFilename = `Daily_Gas_Report_${forDateStr}.xlsx`;

  const formattedCorrected = totalCorrectedConsumption.toFixed(3);
  const formattedUncorrected = totalUncorrectedConsumption.toFixed(3);

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Daily Gas Consumption Report — ${forDateStr}</title>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Inter',Arial,sans-serif;color:#f8fafc;">
  <div style="max-width:640px;margin:32px auto;background:#1e293b;border-radius:12px;overflow:hidden;border:1px solid #334155;box-shadow:0 10px 25px -5px rgba(0,0,0,0.3);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);padding:28px 32px;">
      <h1 style="margin:0;font-size:20px;font-weight:700;color:#fff;letter-spacing:-0.3px;">
        Daily Gas Consumption Summary
      </h1>
      <p style="margin:6px 0 0;font-size:14px;color:rgba(255,255,255,0.85);">
        Date: <strong>${forDateStr}</strong> &nbsp;·&nbsp; Generated at ${new Date().toUTCString()}
      </p>
    </div>

    <!-- Executive Metrics Grid -->
    <div style="padding:28px 32px;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px;">
        <div style="background:#0f172a;padding:20px;border-radius:8px;border:1px solid #334155;">
          <div style="font-size:12px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Total Customers</div>
          <div style="font-size:26px;font-weight:700;color:#6366f1;margin-top:4px;">${customers.length} <span style="font-size:13px;font-weight:normal;color:#94a3b8;">(${customersWithDataCount} active)</span></div>
        </div>
        <div style="background:#0f172a;padding:20px;border-radius:8px;border:1px solid #334155;">
          <div style="font-size:12px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Total Meters</div>
          <div style="font-size:26px;font-weight:700;color:#38bdf8;margin-top:4px;">${totalMetersCount}</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:28px;">
        <div style="background:#0f172a;padding:20px;border-radius:8px;border:1px solid #334155;">
          <div style="font-size:12px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Corrected Volume</div>
          <div style="font-size:24px;font-weight:700;color:#10b981;margin-top:4px;font-family:monospace;">${formattedCorrected} <span style="font-size:13px;font-weight:normal;">Sm³</span></div>
        </div>
        <div style="background:#0f172a;padding:20px;border-radius:8px;border:1px solid #334155;">
          <div style="font-size:12px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Uncorrected Volume</div>
          <div style="font-size:24px;font-weight:700;color:#f59e0b;margin-top:4px;font-family:monospace;">${formattedUncorrected} <span style="font-size:13px;font-weight:normal;">m³</span></div>
        </div>
      </div>

      <!-- Attachment Banner -->
      <div style="background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.3);border-radius:8px;padding:16px 20px;display:flex;align-items:center;gap:16px;">
        <div style="font-size:24px;">📊</div>
        <div>
          <div style="font-size:14px;font-weight:600;color:#818cf8;">Excel Report Attached</div>
          <div style="font-size:13px;color:#94a3b8;margin-top:2px;">
            The detailed meter readings breakdown spreadsheet <strong>${attachmentFilename}</strong> is attached to this email.
          </div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div style="padding:16px 32px 24px;border-top:1px solid #334155;text-align:center;">
      <p style="margin:0;font-size:12px;color:#64748b;">
        AMR Gas Metering System &nbsp;·&nbsp; Automated Daily Delivery
      </p>
    </div>
  </div>
</body>
</html>`;

  const resend = new Resend(apiKey);
  const from = process.env.RESEND_FROM_EMAIL?.trim() || DEFAULT_FROM;

  const { data, error } = await resend.emails.send({
    from,
    to: [to],
    subject: `Daily Gas Report — ${forDateStr} (${totalMetersCount} meters, ${formattedCorrected} Sm³)`,
    html,
    attachments: [
      {
        filename: attachmentFilename,
        content: excelBuffer,
      },
    ],
  });

  if (error) {
    throw new Error(`Resend error: ${JSON.stringify(error)}`);
  }

  return {
    sent: true,
    emailId: data?.id,
    customersIncluded: customers.length,
  };
}
