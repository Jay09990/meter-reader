import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    let customerId = body.customerId;

    // Support creating a customer on the fly (provisioning)
    if (body.provision) {
      if (!body.customerName || !body.category) {
        return NextResponse.json({ error: "Customer name and category are required for provisioning" }, { status: 400 });
      }

      let gaId = body.gaId;
      if (!gaId) {
        // Fallback: Find the first geographical area or create a default one
        let ga = await db.geographicalArea.findFirst();
        if (!ga) {
          ga = await db.geographicalArea.create({
            data: { name: "Default Area", code: "DEFAULT" },
          });
        }
        gaId = ga.id;
      }

      const customer = await db.customer.create({
        data: {
          name: body.customerName,
          category: body.category,
          address: body.address || null,
          gaId: gaId,
        },
      });
      customerId = customer.id;
    }

    const device = await db.device.update({
      where: { id },
      data: {
        customerId: customerId,
        meterSerialNo: body.meterSerialNo !== undefined ? body.meterSerialNo : undefined,
        latitude: body.latitude !== undefined ? body.latitude : undefined,
        longitude: body.longitude !== undefined ? body.longitude : undefined,
      },
    });
    return NextResponse.json(device);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to assign device";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
