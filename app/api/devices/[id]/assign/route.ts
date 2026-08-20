import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkDeviceThresholds } from "@/features/alarms/threshold-check";

const optionalNumber = (value: unknown) => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

function parseCoordinate(value: unknown, min: number, max: number): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const coordinate = Number(value);
  if (!Number.isFinite(coordinate) || coordinate < min || coordinate > max) {
    throw new Error(`Coordinate out of range: ${value}`);
  }
  return coordinate;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    
    // Find device by id (CUID) or deviceSerialNo
    const foundDevice = await db.device.findFirst({
      where: {
        OR: [
          { id },
          { deviceSerialNo: id }
        ]
      }
    });
    if (!foundDevice) {
      return NextResponse.json({ error: "Device not found" }, { status: 404 });
    }

    const body = await req.json();
    let latitude: number | null | undefined;
    let longitude: number | null | undefined;
    try {
      latitude = parseCoordinate(body.latitude, -90, 90);
      longitude = parseCoordinate(body.longitude, -180, 180);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid coordinate" }, { status: 400 });
    }

    let customerId = body.customerId;

    // Support creating a customer on the fly (provisioning)
    if (body.provision) {
      if (body.existingCustomerId) {
        // User selected an existing customer
        const customer = await db.customer.findUnique({
          where: { id: body.existingCustomerId },
        });
        if (!customer) {
          return NextResponse.json({ error: "Selected customer not found" }, { status: 404 });
        }
        customerId = customer.id;
      } else {
        if (!body.customerName || !body.category) {
          return NextResponse.json(
            { error: "Customer name and category are required for provisioning" },
            { status: 400 },
          );
        }

        const trimmedName = body.customerName.trim();

        // Guard against creating a second customer record with a name that
        // already exists — this is what causes a single real-world customer
        // to end up split across two Customer rows, each owning a different
        // subset of meters (e.g. reports only showing "half" of a customer).
        const existingByName = await db.customer.findFirst({
          where: { name: { equals: trimmedName, mode: "insensitive" } },
        });
        if (existingByName) {
          return NextResponse.json(
            {
              error: `A customer named "${existingByName.name}" already exists. Use "Existing Customer" and select it instead of creating a new one.`,
              existingCustomerId: existingByName.id,
            },
            { status: 409 },
          );
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
            name: trimmedName,
            category: body.category,
            address: body.address || null,
            gaId: gaId,
          },
        });
        customerId = customer.id;
      }
    }

    const device = await db.device.update({
      where: { id: foundDevice.id },
      data: {
        customerId: customerId,
        meterSerialNo:
          body.meterSerialNo !== undefined ? body.meterSerialNo : undefined,
        latitude,
        longitude,
        pressureUpperLimit: optionalNumber(body.pressureUpperLimit),
        pressureLowerLimit: optionalNumber(body.pressureLowerLimit),
        temperatureUpperLimit: optionalNumber(body.temperatureUpperLimit),
        temperatureLowerLimit: optionalNumber(body.temperatureLowerLimit),
        consumptionUpperLimit: optionalNumber(body.consumptionUpperLimit),
        consumptionLowerLimit: optionalNumber(body.consumptionLowerLimit),
        batteryLowerLimit: optionalNumber(body.batteryLowerLimit),
      },
    });

    // Evaluate thresholds immediately against the latest reading of this device
    const latestReading = await db.reading.findFirst({
      where: { deviceId: foundDevice.id },
      orderBy: { readingDate: "desc" },
    });
    if (latestReading) {
      await checkDeviceThresholds(foundDevice.id, latestReading.readingDate, {
        gasPressure: latestReading.gasPressure,
        gasTemperature: latestReading.gasTemperature,
        batteryLevel: latestReading.batteryLevel,
        correctedVolumeVb: latestReading.correctedVolumeVb,
      });
    }

    return NextResponse.json(device);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to assign device";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
