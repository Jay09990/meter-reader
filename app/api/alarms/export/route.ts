import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import { AlarmStatus, AlarmSeverity, AlarmType } from "@prisma/client";
import { logApi } from "@/lib/api-log";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get("status");
    const severityParam = searchParams.get("severity");
    const typeParam = searchParams.get("type");
    const format = searchParams.get("format") || "xlsx";

    const where: import("@prisma/client").Prisma.AlarmWhereInput = {};
    if (statusParam && statusParam !== "all") where.status = statusParam as AlarmStatus;
    if (severityParam && severityParam !== "all") where.severity = severityParam as AlarmSeverity;
    if (typeParam && typeParam !== "all") where.type = typeParam as AlarmType;

    logApi("GET /api/alarms/export", { status: statusParam, severity: severityParam, type: typeParam, format });

    const alarms = await db.alarm.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        device: {
          select: {
            deviceSerialNo: true,
            meterSerialNo: true,
            customer: {
              select: {
                name: true,
                category: true,
                ga: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    logApi("GET /api/alarms/export → 200", { rows: alarms.length });

    const rows = alarms.map((a) => {
      const isDummyEpoch = a.forDate && a.forDate.getFullYear() <= 1970;
      const dateStr = !isDummyEpoch && a.forDate
        ? a.forDate.toISOString().split("T")[0]
        : a.createdAt.toISOString().split("T")[0];

      const createdAtStr = a.createdAt
        ? new Date(a.createdAt).toLocaleString("en-US", {
            year: "numeric",
            month: "short",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: true,
          })
        : "N/A";

      return {
        "Alarm Date": dateStr,
        "Timestamp": createdAtStr,
        "Customer Name": a.device.customer?.name || "Unassigned",
        "Customer Type": a.device.customer?.category || "N/A",
        "GA": a.device.customer?.ga?.name || "—",
        "Device Serial No": a.device.deviceSerialNo,
        "Meter Serial No": a.device.meterSerialNo || "N/A",
        "Alarm Type": a.type.replace(/_/g, " "),
        "Severity": a.severity,
        "Status": a.status,
        "Acknowledged": a.acknowledged ? "Yes" : "No",
        "Cause / Description": a.cause,
        "Alarm ID": a.id,
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [
      { "Alarm Date": "No alarms found for selected criteria" }
    ]);

    // Auto-size columns with generous padding so nothing is congested
    if (rows.length > 0) {
      const headers = Object.keys(rows[0]);
      worksheet["!cols"] = headers.map((header) => {
        const maxLen = rows.reduce((max, row) => {
          const val = (row as Record<string, unknown>)[header];
          const len = val == null ? 0 : String(val).length;
          return Math.max(max, len);
        }, header.length);
        return { wch: Math.min(Math.max(maxLen + 4, 14), 60) };
      });
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Alarms");

    const nowStr = new Date().toISOString().split("T")[0];

    if (format === "csv") {
      const csvData = XLSX.utils.sheet_to_csv(worksheet);
      return new NextResponse(csvData, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="alarms_export_${nowStr}.csv"`,
        },
      });
    }

    const excelBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

    return new NextResponse(new Uint8Array(excelBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="alarms_export_${nowStr}.xlsx"`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to export alarms";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
