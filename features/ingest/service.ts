import { db } from "@/lib/db";
import { parseIngestPayload } from "./parser";
import { checkGasOutOfRangeAlarm } from "./alarm-check";
import { Prisma } from "@prisma/client";

export async function processIngestPayload(rawBody: unknown) {
  const parsed = parseIngestPayload(rawBody);

  // 1. Upsert Device registry
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

  // 2. Upsert Reading
  const readingData = {
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
    hourlyConsumption: parsed.hourlyConsumption ? JSON.parse(JSON.stringify(parsed.hourlyConsumption)) : Prisma.JsonNull,
    rawPayload: JSON.parse(JSON.stringify(parsed.rawPayload)),
    receivedAt: new Date(),
  };

  const reading = await db.reading.upsert({
    where: {
      deviceId_readingDate: {
        deviceId: device.id,
        readingDate: parsed.readingDate,
      },
    },
    create: {
      deviceId: device.id,
      readingDate: parsed.readingDate,
      ...readingData,
    },
    update: readingData,
  });

  // 3. Run inline alarm checks
  await checkGasOutOfRangeAlarm(device.id, parsed.readingDate, parsed.correctedVolumeVb);

  return {
    success: true,
    deviceId: device.id,
    deviceSerialNo: device.deviceSerialNo,
    readingId: reading.id,
    readingDate: parsed.readingDate.toISOString().split("T")[0],
  };
}
