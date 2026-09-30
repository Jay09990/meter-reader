import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logApi } from "@/lib/api-log";
import { requireApiUser, unauthorizedResponse } from "@/lib/auth-api";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser();
    if (!user) return unauthorizedResponse();
    const { id } = await params;
    const body = await req.json();
    logApi("PATCH /api/customers/[id]", { id, body });
    const customer = await db.customer.update({
      where: { id, gaId: user.gaId },
      data: {
        name: body.name,
        address: body.address,
      },
    });
    logApi("PATCH /api/customers/[id] → 200", { id: customer.id });
    return NextResponse.json(customer);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update Customer";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser();
    if (!user) return unauthorizedResponse();
    const { id } = await params;
    logApi("GET /api/customers/[id]", { id });
    const customer = await db.customer.findUnique({
      where: { id, gaId: user.gaId },
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

    logApi("GET /api/customers/[id] → 200", { id: customer.id });
    return NextResponse.json(customer);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch Customer";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
