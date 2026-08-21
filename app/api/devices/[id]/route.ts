import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkDeviceThresholds } from "@/features/alarms/threshold-check";
import {
  optionalNumber,
  optionalString,
  parseCoordinate,
  validateThresholdPairs,
} from "@/lib/device-field-parse";

/**
 * PATCH /api/devices/[id] — post-provisioning update of identity/location/model
 * and/or threshold fields on an already-provisioned device.
 * Does not accept deviceSerialNo (ingest identity key) or customer reassignment.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const foundDevice = await db.device.findFirst({
      where: {
        OR: [{ id }, { deviceSerialNo: id }],
      },
    });
    if (!foundDevice) {
      return NextResponse.json({ error: "Device not found" }, { status: 404 });
    }

    const body = await req.json();

    if ("deviceSerialNo" in body) {
      return NextResponse.json(
        { error: "deviceSerialNo cannot be changed after provisioning." },
        { status: 400 },
      );
    }

    let latitude: number | null | undefined;
    let longitude: number | null | undefined;
    try {
      latitude = parseCoordinate(body.latitude, -90, 90);
      longitude = parseCoordinate(body.longitude, -180, 180);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Invalid coordinate" },
        { status: 400 },
      );
    }

    const pressureUpperLimit = optionalNumber(body.pressureUpperLimit);
    const pressureLowerLimit = optionalNumber(body.pressureLowerLimit);
    const temperatureUpperLimit = optionalNumber(body.temperatureUpperLimit);
    const temperatureLowerLimit = optionalNumber(body.temperatureLowerLimit);
    const consumptionUpperLimit = optionalNumber(body.consumptionUpperLimit);
    const consumptionLowerLimit = optionalNumber(body.consumptionLowerLimit);
    const batteryLowerLimit = optionalNumber(body.batteryLowerLimit);

    // Merge with existing values for pair checks when only one side is being updated.
    const pairError = validateThresholdPairs({
      pressureUpperLimit:
        pressureUpperLimit !== undefined
          ? pressureUpperLimit
          : foundDevice.pressureUpperLimit,
      pressureLowerLimit:
        pressureLowerLimit !== undefined
          ? pressureLowerLimit
          : foundDevice.pressureLowerLimit,
      temperatureUpperLimit:
        temperatureUpperLimit !== undefined
          ? temperatureUpperLimit
          : foundDevice.temperatureUpperLimit,
      temperatureLowerLimit:
        temperatureLowerLimit !== undefined
          ? temperatureLowerLimit
          : foundDevice.temperatureLowerLimit,
      consumptionUpperLimit:
        consumptionUpperLimit !== undefined
          ? consumptionUpperLimit
          : foundDevice.consumptionUpperLimit,
      consumptionLowerLimit:
        consumptionLowerLimit !== undefined
          ? consumptionLowerLimit
          : foundDevice.consumptionLowerLimit,
    });
    if (pairError) {
      return NextResponse.json({ error: pairError }, { status: 400 });
    }

    const device = await db.device.update({
      where: { id: foundDevice.id },
      data: {
        meterSerialNo: optionalString(body.meterSerialNo),
        meterSize: optionalString(body.meterSize),
        firmwareVersion: optionalString(body.firmwareVersion),
        hardwareVersion: optionalString(body.hardwareVersion),
        deviceModel: optionalString(body.deviceModel),
        configurationVersion: optionalString(body.configurationVersion),
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
      err instanceof Error ? err.message : "Failed to update device";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
