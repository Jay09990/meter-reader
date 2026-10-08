import { db } from "@/lib/db";
import { AlarmStatus, AlarmType, Prisma } from "@prisma/client";

export interface GetAlarmsOptions {
  page?: number;
  limit?: number;
  status?: AlarmStatus;
  type?: AlarmType;
  severity?: import("@prisma/client").AlarmSeverity;
  search?: string;
  customerId?: string;
  date?: string;
  acknowledged?: boolean;
  gaId?: string;
}

export async function getPaginatedAlarms(options: GetAlarmsOptions) {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 10));
  const skip = (page - 1) * limit;

  const where: Prisma.AlarmWhereInput = {};
  if (options.gaId) {
    where.device = { ...(where.device as object || {}), customer: { gaId: options.gaId } };
  }

  if (options.customerId && options.customerId !== "all") {
    where.device = { ...(where.device as object || {}), customerId: options.customerId };
  }

  if (options.date && options.date.trim()) {
    const dStr = options.date.trim();
    const startOfDay = new Date(`${dStr}T00:00:00.000Z`);
    const endOfDay = new Date(`${dStr}T23:59:59.999Z`);
    if (!isNaN(startOfDay.getTime())) {
      where.createdAt = { gte: startOfDay, lte: endOfDay };
    }
  }

  if (options.status) {
    where.status = options.status;
  }

  if (options.type) {
    where.type = options.type;
  }

  if (options.severity) {
    where.severity = options.severity;
  }

  if (options.acknowledged !== undefined) {
    where.acknowledged = options.acknowledged;
  }

  if (options.search && options.search.trim()) {
    const s = options.search.trim();
    where.OR = [
      { device: { deviceSerialNo: { contains: s, mode: "insensitive" } } },
      { device: { meterSerialNo: { contains: s, mode: "insensitive" } } },
      { device: { customer: { name: { contains: s, mode: "insensitive" } } } },
    ];
  }

  const [alarms, totalCount] = await Promise.all([
    db.alarm.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        device: {
          select: {
            id: true,
            deviceSerialNo: true,
            meterSerialNo: true,
            customer: {
              select: { name: true, ga: { select: { name: true } } }
            }
          },
        },
      },
    }),
    db.alarm.count({ where }),
  ]);

  const items = alarms.map((a) => ({
    id: a.id,
    deviceId: a.deviceId,
    deviceSerialNo: a.device.deviceSerialNo,
    meterSerialNo: a.device.meterSerialNo,
    customerName: a.device.customer?.name || null,
    gaName: a.device.customer?.ga?.name || null,
    type: a.type,
    cause: a.cause,
    gasValue: a.gasValue,
    averageValue: a.averageValue,
    forDate: a.forDate.toISOString().split("T")[0],
    status: a.status,
    severity: a.severity,
    acknowledged: a.acknowledged,
    createdAt: a.createdAt,
  }));

  return {
    items,
    pagination: {
      page,
      limit,
      totalCount,
      totalPages: Math.ceil(totalCount / limit) || 1,
    },
  };
}

export async function getOpenAlarmCount(gaId?: string) {
  const count = await db.alarm.count({
    where: { status: AlarmStatus.OPEN, acknowledged: false, ...(gaId ? { device: { customer: { gaId } } } : {}) },
  });
  return count;
}
