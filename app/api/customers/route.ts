import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { CustomerCategory, Prisma } from "@prisma/client";
import { logApi } from "@/lib/api-log";
import { getGaScope, requireApiUser, unauthorizedResponse } from "@/lib/auth-api";

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (!user) return unauthorizedResponse();
    const body = await req.json();
    logApi("POST /api/customers", { body });
    if (!body.name || (user.role !== "ADMIN" && !body.gaId) || (user.role === "ADMIN" && !body.gaId)) {
      return NextResponse.json(
        { error: "Name and gaId are required" },
        { status: 400 },
      );
    }

    const customer = await db.customer.create({
      data: {
        name: body.name,
        address: body.address || null,
        gaId: user.role === "ADMIN" ? body.gaId : user.gaId,
      },
    });
    logApi("POST /api/customers → 201", { id: customer.id, name: customer.name });
    return NextResponse.json(customer, { status: 201 });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to create Customer";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (!user) return unauthorizedResponse();
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.max(1, parseInt(searchParams.get("limit") || "20"));
    const search = searchParams.get("search") || "";
    const gaId = getGaScope(user);
    const category = searchParams.get("category") || "";

    logApi("GET /api/customers", { page, limit, search, gaId, category });

    const where: Prisma.CustomerWhereInput = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        {
          devices: {
            some: { deviceSerialNo: { contains: search, mode: "insensitive" } },
          },
        },
      ];
    }
    if (gaId) where.gaId = gaId;
    if (category) where.devices = { some: { category: category as CustomerCategory } };

    const [total, data] = await Promise.all([
      db.customer.count({ where }),
      db.customer.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          ga: { select: { name: true } },
          devices: {
            select: {
              deviceSerialNo: true,
              meterSerialNo: true,
              lastSeenAt: true,
              category: true,
            },
          },
        },
        orderBy: { name: "asc" },
      }),
    ]);

    logApi("GET /api/customers → 200", { total, returned: data.length });
    return NextResponse.json({ data, total, page, limit });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to list customers";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
