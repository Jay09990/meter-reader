import { describe, it, expect } from "vitest";
import { parseIngestPayload } from "./parser";

describe("parseIngestPayload", () => {
  it("should correctly parse a valid payload with full device and volume data", () => {
    const raw = {
      deviceSerialNo: "EVC-TEST-001",
      meterSerialNo: "MTR-100",
      meterSize: "4 inch",
      firmwareVersion: "1.0.0",
      readingDate: "2026-07-20",
      volume: {
        correctedVb: 1500.5,
        uncorrectedVm: 1450.2,
      },
      pressure: {
        value: 4.2,
        max: 4.5,
        min: 3.9,
      },
      temperature: {
        value: 25.0,
      },
      gasProperties: {
        compressibilityZ: 0.98,
      },
      hourlyConsumption: [{ hour: 0, value: 12.3 }],
    };

    const parsed = parseIngestPayload(raw);

    expect(parsed.deviceSerialNo).toBe("EVC-TEST-001");
    expect(parsed.meterSerialNo).toBe("MTR-100");
    expect(parsed.correctedVolumeVb).toBe(1500.5);
    expect(parsed.gasPressure).toBe(4.2);
    expect(parsed.gasTemperature).toBe(25.0);
    expect(parsed.compressibilityZ).toBe(0.98);
    expect(parsed.hourlyConsumption).toEqual([{ hour: 0, value: 12.3 }]);
  });

  it("should correctly parse a wrapped payload with data property", () => {
    const raw = {
      data: {
        deviceSerialNo: "EVC-WRAPPED-001",
        meterSerialNo: "MTR-200",
        volume: {
          correctedVb: 2000.5,
        },
      },
    };

    const parsed = parseIngestPayload(raw);

    expect(parsed.deviceSerialNo).toBe("EVC-WRAPPED-001");
    expect(parsed.meterSerialNo).toBe("MTR-200");
    expect(parsed.correctedVolumeVb).toBe(2000.5);
  });

  it("should throw error if deviceSerialNo is missing or empty", () => {
    expect(() => parseIngestPayload({})).toThrow("Invalid payload: Missing or empty deviceSerialNo");
    expect(() => parseIngestPayload({ deviceSerialNo: "   " })).toThrow("Invalid payload: Missing or empty deviceSerialNo");
  });

  it("should default readingDate to today if missing or invalid date format", () => {
    const parsed = parseIngestPayload({ deviceSerialNo: "EVC-TEST-002" });
    expect(parsed.readingDate).toBeInstanceOf(Date);
    expect(isNaN(parsed.readingDate.getTime())).toBe(false);
  });
});
