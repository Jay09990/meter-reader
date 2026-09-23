import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logApi } from "@/lib/api-log";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    logApi("POST /api/gas", { body });
    if (!body.name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const ga = await db.geographicalArea.create({
      data: {
        name: body.name,
        code: body.code || null,
        parentId: body.parentId || null,
      },
    });
    logApi("POST /api/gas → 201", { id: ga.id, name: ga.name });
    return NextResponse.json(ga, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create GA";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const gas = await db.geographicalArea.findMany({
      orderBy: { name: "asc" },
      include: {
        parent: { select: { name: true } },
      },
    });
    logApi("GET /api/gas → 200", { count: gas.length });
    return NextResponse.json(gas);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to list GAs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
