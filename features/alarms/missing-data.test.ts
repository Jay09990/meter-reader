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
      upsert: vi.fn(),
    },
  },
}));

import { generateMissingDataAlarms } from "./missing-data";
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

    vi.mocked(db.device.findMany)
      .mockResolvedValueOnce(mockDevices as never)
      .mockResolvedValueOnce([] as never); // second batch = empty → stop

    vi.mocked(db.reading.findMany).mockResolvedValueOnce(mockReadings as never);
    vi.mocked(db.alarm.upsert).mockResolvedValue({} as never);

    const forDate = new Date("2026-07-20T00:00:00Z");
    const result = await generateMissingDataAlarms(forDate);

    expect(result.checked).toBe(3);
    expect(result.alarmsFired).toBe(1);
    expect(db.alarm.upsert).toHaveBeenCalledTimes(1);
    expect(db.alarm.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deviceId_type_forDate: expect.objectContaining({
            deviceId: "device-2",
            type: "MISSING_DATA",
          }),
        }),
        create: expect.objectContaining({
          deviceId: "device-2",
          type: "MISSING_DATA",
          cause: "No data received for 2026-07-20",
        }),
      })
    );
  });

  it("fires no alarms when all devices reported", async () => {
    const mockDevices = [{ id: "device-1" }, { id: "device-2" }];
    const mockReadings = [{ deviceId: "device-1" }, { deviceId: "device-2" }];

    vi.mocked(db.device.findMany)
      .mockResolvedValueOnce(mockDevices as never)
      .mockResolvedValueOnce([] as never);
    vi.mocked(db.reading.findMany).mockResolvedValueOnce(mockReadings as never);

    const result = await generateMissingDataAlarms(new Date("2026-07-20T00:00:00Z"));

    expect(result.checked).toBe(2);
    expect(result.alarmsFired).toBe(0);
    expect(db.alarm.upsert).not.toHaveBeenCalled();
  });

  it("handles empty device fleet gracefully", async () => {
    vi.mocked(db.device.findMany).mockResolvedValueOnce([] as never);

    const result = await generateMissingDataAlarms(new Date("2026-07-20T00:00:00Z"));

    expect(result.checked).toBe(0);
    expect(result.alarmsFired).toBe(0);
    expect(db.alarm.upsert).not.toHaveBeenCalled();
  });
});
