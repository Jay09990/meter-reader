import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log("Incoming POST /api/customers", { url: req.url, headers: Object.fromEntries(req.headers) });
    console.log("Customer create payload:", body);
    if (!body.name || !body.gaId || !body.category) {
      return NextResponse.json({ error: "Name, gaId, and category are required" }, { status: 400 });
    }

    const customer = await db.customer.create({
      data: {
        name: body.name,
        category: body.category,
        address: body.address || null,
        gaId: body.gaId,
      },
    });
    return NextResponse.json(customer, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create Customer";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.max(1, parseInt(searchParams.get("limit") || "20"));
    const search = searchParams.get("search") || "";
    const gaId = searchParams.get("gaId") || "";
    const category = searchParams.get("category") || "";

    const where: Prisma.CustomerWhereInput = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { devices: { some: { deviceSerialNo: { contains: search, mode: "insensitive" } } } },
      ];
    }
    if (gaId) where.gaId = gaId;
    if (category) where.category = category as Prisma.CustomerWhereInput["category"];

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
            },
          },
        },
        orderBy: { name: "asc" },
      }),
    ]);

    return NextResponse.json({ data, total, page, limit });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to list customers";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
