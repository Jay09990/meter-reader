import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logApi } from "@/lib/api-log";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    logApi("PATCH /api/gas/[id]", { id, body });
    const ga = await db.geographicalArea.update({
      where: { id },
      data: {
        name: body.name,
        code: body.code,
        parentId: body.parentId,
      },
    });
    logApi("PATCH /api/gas/[id] → 200", { id: ga.id });
    return NextResponse.json(ga);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update GA";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
