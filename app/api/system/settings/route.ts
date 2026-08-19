import { NextRequest, NextResponse } from "next/server";
import { getMaxMeterCapacity, setMaxMeterCapacity } from "@/features/system-capacity/service";

// Reads and updates the system-wide meter capacity setting.
export async function GET() {
  try {
    return NextResponse.json({ maxMeterCapacity: await getMaxMeterCapacity() });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load system settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body: unknown = await req.json();
    const maxMeterCapacity =
      typeof body === "object" && body !== null && "maxMeterCapacity" in body
        ? (body as { maxMeterCapacity?: unknown }).maxMeterCapacity
        : undefined;

    if (maxMeterCapacity === undefined || (maxMeterCapacity !== null && (!Number.isInteger(maxMeterCapacity) || (maxMeterCapacity as number) < 0))) {
      return NextResponse.json(
        { error: "maxMeterCapacity must be a non-negative whole number or null" },
        { status: 400 },
      );
    }

    return NextResponse.json({ maxMeterCapacity: await setMaxMeterCapacity(maxMeterCapacity as number | null) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update system settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
