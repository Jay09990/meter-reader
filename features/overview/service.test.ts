import { describe, expect, it } from "vitest";
import { buildCategoryTotals } from "./service";

describe("overview analytics helpers", () => {
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
