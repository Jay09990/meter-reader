import { db } from "@/lib/db";
import { parseIngestPayload } from "./parser";
import { checkGasOutOfRangeAlarm } from "./alarm-check";
import { Prisma } from "@prisma/client";

export async function processIngestPayload(rawBody: unknown) {
  const parsed = parseIngestPayload(rawBody);

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

  // 2. Create Reading — CHANGED: every push is now its own row. No more
  // upsert-by-(deviceId, readingDate); a second push for the same day no
  // longer overwrites the first, it's appended. "Which row is authoritative
  // for a given day" is now a read-time decision (latest by receivedAt —
  // see features/devices/service.ts and features/ingest/alarm-check.ts),
  // not an ingest-time one.
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

  // 3. Run inline alarm checks (unchanged call site — logic inside now
  // accounts for multiple readings/day, see alarm-check.ts)
  await checkGasOutOfRangeAlarm(device.id, parsed.readingDate, parsed.correctedVolumeVb);

  return {
    success: true,
    deviceId: device.id,
    deviceSerialNo: device.deviceSerialNo,
    readingId: reading.id,
    readingDate: parsed.readingDate.toISOString(),
  };
}