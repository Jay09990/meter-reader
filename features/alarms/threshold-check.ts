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
  unit: string;
  direction: "above" | "below";
}

// Evaluates all optional per-meter limits after a reading has been saved.
export async function checkDeviceThresholds(deviceId: string, readingDate: Date, reading: ThresholdReading): Promise<void> {
  const device = await db.device.findUnique({
    where: { id: deviceId },
    select: {
      deviceSerialNo: true,
      meterSerialNo: true,
      pressureUpperLimit: true,
      pressureLowerLimit: true,
      temperatureUpperLimit: true,
      temperatureLowerLimit: true,
      consumptionUpperLimit: true,
      consumptionLowerLimit: true,
      batteryLowerLimit: true,
      customer: {
        select: {
          name: true,
          ga: { select: { name: true } },
        },
      },
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
      breaches.push({ type, value, limit: upperLimit, unit, direction: "above", cause: `${metric} reading of ${value} ${unit} exceeded the configured upper threshold of ${upperLimit} ${unit} for meter ${device.deviceSerialNo}.` });
    } else if (lowerLimit != null && value < lowerLimit) {
      breaches.push({ type, value, limit: lowerLimit, unit, direction: "below", cause: `${metric} reading of ${value} ${unit} fell below the configured lower threshold of ${lowerLimit} ${unit} for meter ${device.deviceSerialNo}.` });
    }
  };

  thresholdBreach(AlarmType.PRESSURE_OUT_OF_RANGE, reading.gasPressure, device.pressureUpperLimit, device.pressureLowerLimit, "Gas pressure", "bar");
  thresholdBreach(AlarmType.TEMPERATURE_OUT_OF_RANGE, reading.gasTemperature, device.temperatureUpperLimit, device.temperatureLowerLimit, "Gas temperature", "°C");

  // Shared across CONSUMPTION_OUT_OF_RANGE and NO_CONSUMPTION so we only
  // fetch yesterday's boundary reading once per push, regardless of which
  // check(s) end up needing it.
  let yesterdayReading: number | null | undefined;
  const getYesterdayReading = async (): Promise<number | null> => {
    if (yesterdayReading !== undefined) return yesterdayReading;
    const yesterday = new Date(readingDate.getTime() - 86_400_000);
    yesterdayReading = await getDeviceBoundaryReading(deviceId, toIsoDate(yesterday));
    return yesterdayReading;
  };

  if (reading.correctedVolumeVb != null && (device.consumptionUpperLimit != null || device.consumptionLowerLimit != null)) {
    const prev = await getYesterdayReading();
    if (prev != null) {
      const dailyConsumption = reading.correctedVolumeVb - prev;
      if (dailyConsumption >= 0) {
        thresholdBreach(AlarmType.CONSUMPTION_OUT_OF_RANGE, dailyConsumption, device.consumptionUpperLimit, device.consumptionLowerLimit, "Daily consumption", "Sm³");
      }
    }
  }

  // NO_CONSUMPTION — fires when corrected volume hasn't moved at all
  // relative to the previous reading (diff === 0). Unlike
  // CONSUMPTION_OUT_OF_RANGE this isn't gated on a per-meter threshold
  // being configured; a flatlined meter is worth flagging regardless.
  if (reading.correctedVolumeVb != null) {
    const prev = await getYesterdayReading();
    if (prev != null) {
      const diff = reading.correctedVolumeVb - prev;
      if (diff === 0) {
        breaches.push({
          type: AlarmType.NO_CONSUMPTION,
          value: reading.correctedVolumeVb,
          limit: prev,
          unit: "Sm³",
          direction: "below",
          cause: `Corrected volume for meter ${device.deviceSerialNo} is unchanged at ${reading.correctedVolumeVb} Sm³ — no consumption recorded since the previous reading (${prev} Sm³).`,
        });
      }
    }
  }

  if (reading.batteryLevel != null && device.batteryLowerLimit != null && reading.batteryLevel < device.batteryLowerLimit) {
    breaches.push({
      type: AlarmType.BATTERY_LOW,
      value: reading.batteryLevel,
      limit: device.batteryLowerLimit,
      unit: "%",
      direction: "below",
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
    await notifyAlarmCreated({
      deviceSerialNo: device.deviceSerialNo,
      type: breach.type,
      severity: "CRITICAL",
      cause: breach.cause,
      forDate: readingDate,
      meterSerialNo: device.meterSerialNo,
      customerName: device.customer?.name,
      gaName: device.customer?.ga?.name,
      measuredValue: breach.value,
      unit: breach.unit,
      thresholdValue: breach.limit,
      thresholdDirection: breach.direction,
    });
  }
}