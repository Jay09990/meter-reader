import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { AlarmStatus, AlarmSeverity, AlarmType } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get("status");
    const severityParam = searchParams.get("severity");
    const typeParam = searchParams.get("type");

    const where: import("@prisma/client").Prisma.AlarmWhereInput = {};
    if (statusParam) where.status = statusParam as AlarmStatus;
    if (severityParam) where.severity = severityParam as AlarmSeverity;
    if (typeParam) where.type = typeParam as AlarmType;

    const alarms = await db.alarm.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        device: { select: { deviceSerialNo: true, meterSerialNo: true } },
      },
    });

    const csvRows = [
      ["ID", "Device Serial", "Meter Serial", "Type", "Severity", "Status", "Acknowledged", "Cause", "Date", "Created At"],
      ...alarms.map(a => [
        a.id,
        a.device.deviceSerialNo,
        a.device.meterSerialNo || "",
        a.type,
        a.severity,
        a.status,
        a.acknowledged ? "Yes" : "No",
        `"${a.cause.replace(/"/g, '""')}"`,
        a.forDate.toISOString().split("T")[0],
        a.createdAt.toISOString()
      ])
    ];

    const csvData = csvRows.map(row => row.join(",")).join("\n");

    return new NextResponse(csvData, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="alarms_export.csv"',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to export alarms";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
