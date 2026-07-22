import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const ga = await db.geographicalArea.update({
      where: { id },
      data: {
        name: body.name,
        code: body.code,
        parentId: body.parentId,
      },
    });
    return NextResponse.json(ga);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update GA";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
