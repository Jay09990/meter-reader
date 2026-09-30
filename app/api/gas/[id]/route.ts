import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logApi } from "@/lib/api-log";
import { requireAdminUser, unauthorizedResponse, isSameOriginRequest } from "@/lib/auth-api";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAdminUser();
    if (!user) return unauthorizedResponse();
    if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
    const { id } = await params;
    if (id !== user.gaId) return NextResponse.json({ error: "Geographical area not found." }, { status: 404 });
    const body = await req.json();
    logApi("PATCH /api/gas/[id]", { id, body });
    const ga = await db.geographicalArea.update({
      where: { id },
      data: {
        name: body.name,
        code: body.code,
      },
    });
    logApi("PATCH /api/gas/[id] → 200", { id: ga.id });
    return NextResponse.json(ga);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update GA";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
