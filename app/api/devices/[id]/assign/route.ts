import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkDeviceThresholds } from "@/features/alarms/threshold-check";
import {
  optionalNumber,
  parseCoordinate,
  validateThresholdPairs,
} from "@/lib/device-field-parse";
import { logApi } from "@/lib/api-log";
import { CustomerCategory } from "@prisma/client";
import { requireApiUser, unauthorizedResponse } from "@/lib/auth-api";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiUser();
    if (!user) return unauthorizedResponse();
    const { id } = await params;
    
    // Find device by id (CUID) or deviceSerialNo
    const foundDevice = await db.device.findFirst({
      where: {
        AND: [
          { OR: [{ id }, { deviceSerialNo: id }] },
          { OR: [{ customer: { gaId: user.gaId } }, { customerId: null }] },
        ],
      }
    });
    if (!foundDevice) {
      return NextResponse.json({ error: "Device not found" }, { status: 404 });
    }

    const body = await req.json();
    logApi("PATCH /api/devices/[id]/assign", { id, body });
    let latitude: number | null | undefined;
    let longitude: number | null | undefined;
    try {
      latitude = parseCoordinate(body.latitude, -90, 90);
      longitude = parseCoordinate(body.longitude, -180, 180);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid coordinate" }, { status: 400 });
    }

    let customerId = body.customerId || null;

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
        if (customer.gaId !== user.gaId) {
          return NextResponse.json({ error: "Selected customer is outside your geographical area." }, { status: 403 });
        }
        customerId = customer.id;
      } else {
        if (!body.customerName) {
          return NextResponse.json(
            { error: "Customer name is required for provisioning" },
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

        const customer = await db.customer.create({
          data: {
            name: trimmedName,
            address: body.address || null,
            gaId: user.gaId,
          },
        });
        customerId = customer.id;
      }
    }

    if (customerId) {
      const customer = await db.customer.findFirst({ where: { id: customerId, gaId: user.gaId }, select: { id: true } });
      if (!customer) return NextResponse.json({ error: "Selected customer is outside your geographical area." }, { status: 403 });
    }

    const category = body.category == null || body.category === "" ? null : body.category;
    if (category !== null && (typeof category !== "string" || !Object.values(CustomerCategory).includes(category as CustomerCategory))) {
      return NextResponse.json({ error: "Select a valid meter category." }, { status: 400 });
    }

    const pressureUpperLimit = optionalNumber(body.pressureUpperLimit);
    const pressureLowerLimit = optionalNumber(body.pressureLowerLimit);
    const temperatureUpperLimit = optionalNumber(body.temperatureUpperLimit);
    const temperatureLowerLimit = optionalNumber(body.temperatureLowerLimit);
    const consumptionUpperLimit = optionalNumber(body.consumptionUpperLimit);
    const consumptionLowerLimit = optionalNumber(body.consumptionLowerLimit);
    const batteryLowerLimit = optionalNumber(body.batteryLowerLimit);

    const pairError = validateThresholdPairs({
      pressureUpperLimit: pressureUpperLimit ?? null,
      pressureLowerLimit: pressureLowerLimit ?? null,
      temperatureUpperLimit: temperatureUpperLimit ?? null,
      temperatureLowerLimit: temperatureLowerLimit ?? null,
      consumptionUpperLimit: consumptionUpperLimit ?? null,
      consumptionLowerLimit: consumptionLowerLimit ?? null,
    });
    if (pairError) {
      return NextResponse.json({ error: pairError }, { status: 400 });
    }

    const device = await db.device.update({
      where: { id: foundDevice.id },
      data: {
        customerId: customerId,
        category: body.category === undefined ? undefined : category,
        meterSerialNo:
          body.meterSerialNo !== undefined ? body.meterSerialNo : undefined,
        latitude,
        longitude,
        pressureUpperLimit,
        pressureLowerLimit,
        temperatureUpperLimit,
        temperatureLowerLimit,
        consumptionUpperLimit,
        consumptionLowerLimit,
        batteryLowerLimit,
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

    logApi("PATCH /api/devices/[id]/assign → 200", { id: device.id, customerId: device.customerId });
    return NextResponse.json(device);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to assign device";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
