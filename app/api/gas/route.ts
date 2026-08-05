import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log("Incoming POST /api/gas", { url: req.url, headers: Object.fromEntries(req.headers) });
    console.log("Gas create payload:", body);
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
    return NextResponse.json(gas);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to list GAs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
