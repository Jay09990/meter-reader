import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the db module so no real DB is hit
vi.mock("@/lib/db", () => ({
  db: {
    device: {
      findMany: vi.fn(),
    },
    reading: {
      findMany: vi.fn(),
    },
    alarm: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

// Mock email notifications — they are covered by their own concerns
vi.mock("./notify", () => ({
  notifyAlarmCreated: vi.fn(),
}));

import { generateMissingDataAlarms } from "./missing-data";
import { notifyAlarmCreated } from "./notify";
import { db } from "@/lib/db";

describe("generateMissingDataAlarms", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("fires alarm for devices with no reading on the target date", async () => {
    const mockDevices = [
      { id: "device-1" },
      { id: "device-2" },
      { id: "device-3" },
    ];

    // device-1 and device-3 reported, device-2 did not
    const mockReadings = [{ deviceId: "device-1" }, { deviceId: "device-3" }];

    vi.mocked(db.device.findMany).mockResolvedValueOnce(mockDevices as never);
    vi.mocked(db.reading.findMany).mockResolvedValueOnce(mockReadings as never);
    vi.mocked(db.alarm.findUnique).mockResolvedValueOnce(null as never);
    vi.mocked(db.alarm.create).mockResolvedValueOnce({} as never);

    const forDate = new Date("2026-07-20T00:00:00Z");
    const result = await generateMissingDataAlarms(forDate);

    expect(result.checked).toBe(3);
    expect(result.alarmsFired).toBe(1);
    expect(db.alarm.create).toHaveBeenCalledTimes(1);
    expect(db.alarm.create).toHaveBeenCalledWith({
      data: {
        deviceId: "device-2",
        type: "MISSING_DATA",
        severity: "CRITICAL",
        forDate,
        cause: "No data received for 2026-07-20",
        status: "OPEN",
      },
    });
    expect(notifyAlarmCreated).toHaveBeenCalledTimes(1);
  });

  it("skips devices that already have a missing-data alarm for the date", async () => {
    const mockDevices = [{ id: "device-1" }];
    const mockReadings: Array<{ deviceId: string }> = [];

    vi.mocked(db.device.findMany).mockResolvedValueOnce(mockDevices as never);
    vi.mocked(db.reading.findMany).mockResolvedValueOnce(mockReadings as never);
    vi.mocked(db.alarm.findUnique).mockResolvedValueOnce({ id: "alarm-1" } as never);

    const result = await generateMissingDataAlarms(new Date("2026-07-20T00:00:00Z"));

    expect(result.checked).toBe(1);
    expect(result.alarmsFired).toBe(0);
    expect(db.alarm.create).not.toHaveBeenCalled();
    expect(notifyAlarmCreated).not.toHaveBeenCalled();
  });

  it("fires no alarms when all devices reported", async () => {
    const mockDevices = [{ id: "device-1" }, { id: "device-2" }];
    const mockReadings = [{ deviceId: "device-1" }, { deviceId: "device-2" }];

    vi.mocked(db.device.findMany).mockResolvedValueOnce(mockDevices as never);
    vi.mocked(db.reading.findMany).mockResolvedValueOnce(mockReadings as never);

    const result = await generateMissingDataAlarms(new Date("2026-07-20T00:00:00Z"));

    expect(result.checked).toBe(2);
    expect(result.alarmsFired).toBe(0);
    expect(db.alarm.create).not.toHaveBeenCalled();
    expect(notifyAlarmCreated).not.toHaveBeenCalled();
  });

  it("handles empty device fleet gracefully", async () => {
    vi.mocked(db.device.findMany).mockResolvedValueOnce([] as never);

    const result = await generateMissingDataAlarms(new Date("2026-07-20T00:00:00Z"));

    expect(result.checked).toBe(0);
    expect(result.alarmsFired).toBe(0);
    expect(db.alarm.create).not.toHaveBeenCalled();
    expect(notifyAlarmCreated).not.toHaveBeenCalled();
  });
});
