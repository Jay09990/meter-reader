import { db } from "@/lib/db";
import { parseIngestPayload } from "./parser";
import { checkGasOutOfRangeAlarm, checkMeterFailureAlarm } from "./alarm-check";
import { Prisma } from "@prisma/client";
import { getMaxMeterCapacity, recordRejectedConnection } from "@/features/system-capacity/service";
import { checkDeviceThresholds } from "@/features/alarms/threshold-check";

export class CapacityExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CapacityExceededError";
  }
}

export async function processIngestPayload(rawBody: unknown) {
  const parsed = parseIngestPayload(rawBody);

  // Capacity applies only to new devices; existing meters must keep reporting.
  const existingDevice = await db.device.findUnique({
    where: { deviceSerialNo: parsed.deviceSerialNo },
    select: { id: true },
  });

  if (!existingDevice) {
    const maxCapacity = await getMaxMeterCapacity();

    if (maxCapacity != null) {
      const currentCount = await db.device.count();
      if (currentCount >= maxCapacity) {
        await recordRejectedConnection(parsed.deviceSerialNo, parsed.rawPayload);
        throw new CapacityExceededError(
          `Maximum meter capacity (${maxCapacity}) reached — rejected new device ${parsed.deviceSerialNo}`,
        );
      }
    }
  }

  // 1. Upsert Device registry (unchanged — a device is still one row,
  // identified by deviceSerialNo; only Reading behavior changes below)
  const deviceUpdateData: Prisma.DeviceUpdateInput = {
    lastSeenAt: new Date(),
  };

  if (parsed.meterSerialNo) deviceUpdateData.meterSerialNo = parsed.meterSerialNo;
  if (parsed.meterSize) deviceUpdateData.meterSize = parsed.meterSize;
  if (parsed.firmwareVersion) deviceUpdateData.firmwareVersion = parsed.firmwareVersion;
  if (parsed.hardwareVersion) deviceUpdateData.hardwareVersion = parsed.hardwareVersion;
  if (parsed.deviceModel) deviceUpdateData.deviceModel = parsed.deviceModel;
  if (parsed.configurationVersion) deviceUpdateData.configurationVersion = parsed.configurationVersion;

  const device = await db.device.upsert({
    where: { deviceSerialNo: parsed.deviceSerialNo },
    create: {
      deviceSerialNo: parsed.deviceSerialNo,
      meterSerialNo: parsed.meterSerialNo,
      meterSize: parsed.meterSize,
      firmwareVersion: parsed.firmwareVersion,
      hardwareVersion: parsed.hardwareVersion,
      deviceModel: parsed.deviceModel,
      configurationVersion: parsed.configurationVersion,
      lastSeenAt: new Date(),
    },
    update: deviceUpdateData,
  });


  // Store every push; measurement timestamps order readings while receivedAt
  // remains the arrival timestamp for audit and deterministic tie-breaking.
  const reading = await db.reading.create({
    data: {
      deviceId: device.id,
      readingDate: parsed.readingDate,
      correctedVolumeVb: parsed.correctedVolumeVb,
      uncorrectedVolumeVm: parsed.uncorrectedVolumeVm,
      gasPressure: parsed.gasPressure,
      pressureMax: parsed.pressureMax,
      pressureMin: parsed.pressureMin,
      gasTemperature: parsed.gasTemperature,
      temperatureMax: parsed.temperatureMax,
      temperatureMin: parsed.temperatureMin,
      compressibilityZ: parsed.compressibilityZ,
      compressibilityFpv: parsed.compressibilityFpv,
      correctionFactorC: parsed.correctionFactorC,
      gasDensity: parsed.gasDensity,
      batteryLevel: parsed.batteryLevel,
      currentFlowRate: parsed.currentFlowRate,
      hourlyConsumption: parsed.hourlyConsumption
        ? JSON.parse(JSON.stringify(parsed.hourlyConsumption))
        : Prisma.JsonNull,
      rawPayload: JSON.parse(JSON.stringify(parsed.rawPayload)),
      receivedAt: new Date(),
    },
  });

  await checkGasOutOfRangeAlarm(device.id, parsed.readingDate, parsed.correctedVolumeVb);
  await checkDeviceThresholds(device.id, parsed.readingDate, {
    gasPressure: parsed.gasPressure ?? null,
    gasTemperature: parsed.gasTemperature ?? null,
    batteryLevel: parsed.batteryLevel ?? null,
    correctedVolumeVb: parsed.correctedVolumeVb ?? null,
  });
  // Meter failure compares corrected and uncorrected daily deltas.
  await checkMeterFailureAlarm(device.id, parsed.readingDate, parsed.correctedVolumeVb, parsed.uncorrectedVolumeVm);

  return {
    success: true,
    deviceId: device.id,
    deviceSerialNo: device.deviceSerialNo,
    readingId: reading.id,
    readingDate: parsed.readingDate.toISOString(),
  };
}
