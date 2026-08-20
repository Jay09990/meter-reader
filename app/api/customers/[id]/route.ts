import { NextRequest, NextResponse } from "next/server";
import { CustomerCategory } from "@prisma/client";
import { db } from "@/lib/db";

/** Accept the legacy provisioning option while persisting the renamed enum value. */
function normalizeCustomerCategory(category: unknown): CustomerCategory {
  return category === "BULK" ? CustomerCategory.DRS : category as CustomerCategory;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const customer = await db.customer.update({
      where: { id },
      data: {
        name: body.name,
        category: normalizeCustomerCategory(body.category),
        address: body.address,
        gaId: body.gaId,
      },
    });
    return NextResponse.json(customer);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update Customer";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const customer = await db.customer.findUnique({
      where: { id },
      include: {
        ga: true,
        devices: {
          include: {
            alarms: {
              where: { status: "OPEN" },
            },
            readings: {
              orderBy: { readingDate: "desc" },
              take: 1,
            },
          },
        },
      },
    });

    if (!customer) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(customer);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch Customer";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
