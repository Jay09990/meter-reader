import { AlarmType } from "@prisma/client";
import { db } from "@/lib/db";
import { getDeviceBoundaryReading } from "@/lib/boundary-readings";
import { toIsoDate } from "@/lib/financial-calendar";
import { notifyAlarmCreated } from "./notify";

interface ThresholdReading {
  gasPressure: number | null;
  gasTemperature: number | null;
  batteryLevel: number | null;
  correctedVolumeVb: number | null;
}

interface ThresholdBreach {
  type: AlarmType;
  value: number;
  limit: number;
  cause: string;
}

// Evaluates all optional per-meter limits after a reading has been saved.
export async function checkDeviceThresholds(deviceId: string, readingDate: Date, reading: ThresholdReading): Promise<void> {
  const device = await db.device.findUnique({
    where: { id: deviceId },
    select: {
      deviceSerialNo: true,
      pressureUpperLimit: true,
      pressureLowerLimit: true,
      temperatureUpperLimit: true,
      temperatureLowerLimit: true,
      consumptionUpperLimit: true,
      consumptionLowerLimit: true,
      batteryLowerLimit: true,
    },
  });
  if (!device) return;

  const breaches: ThresholdBreach[] = [];
  const thresholdBreach = (
    type: AlarmType,
    value: number | null,
    upperLimit: number | null,
    lowerLimit: number | null,
    metric: string,
    unit: string,
  ) => {
    if (value == null) return;
    if (upperLimit != null && value > upperLimit) {
      breaches.push({ type, value, limit: upperLimit, cause: `${metric} reading of ${value} ${unit} exceeded the configured upper threshold of ${upperLimit} ${unit} for meter ${device.deviceSerialNo}.` });
    } else if (lowerLimit != null && value < lowerLimit) {
      breaches.push({ type, value, limit: lowerLimit, cause: `${metric} reading of ${value} ${unit} fell below the configured lower threshold of ${lowerLimit} ${unit} for meter ${device.deviceSerialNo}.` });
    }
  };

  thresholdBreach(AlarmType.PRESSURE_OUT_OF_RANGE, reading.gasPressure, device.pressureUpperLimit, device.pressureLowerLimit, "Gas pressure", "bar");
  thresholdBreach(AlarmType.TEMPERATURE_OUT_OF_RANGE, reading.gasTemperature, device.temperatureUpperLimit, device.temperatureLowerLimit, "Gas temperature", "°C");

  if (reading.correctedVolumeVb != null && (device.consumptionUpperLimit != null || device.consumptionLowerLimit != null)) {
    const yesterday = new Date(readingDate.getTime() - 86_400_000);
    const yesterdayReading = await getDeviceBoundaryReading(deviceId, toIsoDate(yesterday));
    if (yesterdayReading != null) {
      const dailyConsumption = reading.correctedVolumeVb - yesterdayReading;
      if (dailyConsumption >= 0) {
        thresholdBreach(AlarmType.CONSUMPTION_OUT_OF_RANGE, dailyConsumption, device.consumptionUpperLimit, device.consumptionLowerLimit, "Daily consumption", "Sm³");
      }
    }
  }

  if (reading.batteryLevel != null && device.batteryLowerLimit != null && reading.batteryLevel < device.batteryLowerLimit) {
    breaches.push({
      type: AlarmType.BATTERY_LOW,
      value: reading.batteryLevel,
      limit: device.batteryLowerLimit,
      cause: `Battery level of ${reading.batteryLevel}% fell below the configured minimum threshold of ${device.batteryLowerLimit}% for meter ${device.deviceSerialNo}.`,
    });
  }

  for (const breach of breaches) {
    const existing = await db.alarm.findUnique({ where: { deviceId_type_forDate: { deviceId, type: breach.type, forDate: readingDate } } });
    if (existing) {
      await db.alarm.update({ where: { id: existing.id }, data: { gasValue: breach.value, averageValue: breach.limit, cause: breach.cause, status: "OPEN" } });
      continue;
    }
    await db.alarm.create({ data: { deviceId, type: breach.type, severity: "CRITICAL", forDate: readingDate, gasValue: breach.value, averageValue: breach.limit, cause: breach.cause, status: "OPEN" } });
    await notifyAlarmCreated({ deviceSerialNo: device.deviceSerialNo, type: breach.type, severity: "CRITICAL", cause: breach.cause, forDate: readingDate });
  }
}
