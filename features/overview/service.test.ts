import { describe, expect, it } from "vitest";
import { buildMonthlyConsumptionSeries, buildCategoryTotals } from "./service";

describe("overview analytics helpers", () => {
  it("builds a 7-month series from reading totals", () => {
    const data = [
      { month: "2025-04", value: 100 },
      { month: "2025-05", value: 200 },
      { month: "2025-07", value: 300 },
    ];

    const result = buildMonthlyConsumptionSeries(data, new Date("2025-07-15T00:00:00.000Z"));

    expect(result).toHaveLength(7);
    expect(result[0]).toEqual({ month: "Jan", value: 0 });
    expect(result[4]).toEqual({ month: "May", value: 200 });
    expect(result[6]).toEqual({ month: "Jul", value: 300 });
  });

  it("aggregates category totals and keeps stable ordering", () => {
    const result = buildCategoryTotals([
      { category: "INDUSTRIAL", totalVolume: 1000 },
      { category: "COMMERCIAL", totalVolume: 500 },
      { category: "RESIDENTIAL", totalVolume: 250 },
      { category: "BULK", totalVolume: 125 },
    ]);

    expect(result).toEqual([
      { category: "INDUSTRIAL", totalVolume: 1000 },
      { category: "COMMERCIAL", totalVolume: 500 },
      { category: "RESIDENTIAL", totalVolume: 250 },
      { category: "BULK", totalVolume: 125 },
    ]);
  });
});
