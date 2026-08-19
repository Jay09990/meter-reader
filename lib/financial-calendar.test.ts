/**
 * lib/financial-calendar.test.ts
 *
 * Unit tests for pure date-math helpers.
 * Run with: npx jest lib/financial-calendar.test.ts
 */

import {
  getFinancialYearStart,
  getCurrentQuarterStart,
  getQuarterStart,
  getMonthStart,
  getMonthEnd,
  getQuarterEnd,
  formatDayLabel,
  formatMonthLabel,
  toIsoDate,
  addMonths,
} from "./financial-calendar";

function d(iso: string) {
  return new Date(iso + "T00:00:00.000Z");
}

// ─── getFinancialYearStart ────────────────────────────────────────────────────

describe("getFinancialYearStart", () => {
  it("April date returns current year April 1", () => {
    expect(toIsoDate(getFinancialYearStart(d("2025-04-01")))).toBe("2025-04-01");
  });
  it("April 1 exactly is the FY start", () => {
    expect(toIsoDate(getFinancialYearStart(d("2024-04-01")))).toBe("2024-04-01");
  });
  it("August date returns current year April 1", () => {
    expect(toIsoDate(getFinancialYearStart(d("2025-08-19")))).toBe("2025-04-01");
  });
  it("January date returns PREVIOUS year's April 1", () => {
    expect(toIsoDate(getFinancialYearStart(d("2025-01-15")))).toBe("2024-04-01");
  });
  it("February date returns PREVIOUS year's April 1", () => {
    expect(toIsoDate(getFinancialYearStart(d("2025-02-28")))).toBe("2024-04-01");
  });
  it("March 31 returns PREVIOUS year's April 1", () => {
    expect(toIsoDate(getFinancialYearStart(d("2025-03-31")))).toBe("2024-04-01");
  });
  it("December date returns current year April 1", () => {
    expect(toIsoDate(getFinancialYearStart(d("2024-12-31")))).toBe("2024-04-01");
  });
});

// ─── getCurrentQuarterStart ───────────────────────────────────────────────────

describe("getCurrentQuarterStart", () => {
  it("Apr 1 is start of Q1", () => {
    expect(toIsoDate(getCurrentQuarterStart(d("2025-04-01")))).toBe("2025-04-01");
  });
  it("Jun 30 is still Q1", () => {
    expect(toIsoDate(getCurrentQuarterStart(d("2025-06-30")))).toBe("2025-04-01");
  });
  it("Jul 1 is start of Q2", () => {
    expect(toIsoDate(getCurrentQuarterStart(d("2025-07-01")))).toBe("2025-07-01");
  });
  it("Sep 30 is still Q2", () => {
    expect(toIsoDate(getCurrentQuarterStart(d("2025-09-30")))).toBe("2025-07-01");
  });
  it("Oct 1 is start of Q3", () => {
    expect(toIsoDate(getCurrentQuarterStart(d("2025-10-01")))).toBe("2025-10-01");
  });
  it("Dec 31 is still Q3", () => {
    expect(toIsoDate(getCurrentQuarterStart(d("2025-12-31")))).toBe("2025-10-01");
  });
  it("Jan 1 is start of Q4", () => {
    expect(toIsoDate(getCurrentQuarterStart(d("2026-01-01")))).toBe("2026-01-01");
  });
  it("Mar 31 is still Q4", () => {
    expect(toIsoDate(getCurrentQuarterStart(d("2026-03-31")))).toBe("2026-01-01");
  });
});

// ─── getQuarterStart (walking back) ─────────────────────────────────────────

describe("getQuarterStart", () => {
  const today = d("2025-08-10"); // Q2 Jul-25

  it("quartersAgo=0 returns current quarter", () => {
    expect(toIsoDate(getQuarterStart(today, 0))).toBe("2025-07-01");
  });
  it("quartersAgo=1 returns previous quarter", () => {
    expect(toIsoDate(getQuarterStart(today, 1))).toBe("2025-04-01");
  });
  it("quartersAgo=2 crosses year boundary", () => {
    expect(toIsoDate(getQuarterStart(today, 2))).toBe("2025-01-01");
  });
  it("quartersAgo=3 crosses year boundary further", () => {
    expect(toIsoDate(getQuarterStart(today, 3))).toBe("2024-10-01");
  });
  it("quartersAgo=4 goes to Q2 of prior FY", () => {
    expect(toIsoDate(getQuarterStart(today, 4))).toBe("2024-07-01");
  });

  // Edge case: Q4 (Jan) looking back
  const janDate = d("2026-02-15"); // Q4
  it("from Q4 (Jan-Mar), quartersAgo=1 returns Q3", () => {
    expect(toIsoDate(getQuarterStart(janDate, 1))).toBe("2025-10-01");
  });
});

// ─── getMonthStart / getMonthEnd ─────────────────────────────────────────────

describe("getMonthStart / getMonthEnd", () => {
  it("getMonthStart returns first of month", () => {
    expect(toIsoDate(getMonthStart(d("2025-08-19")))).toBe("2025-08-01");
  });
  it("getMonthEnd returns last day (Aug=31)", () => {
    expect(toIsoDate(getMonthEnd(d("2025-08-01")))).toBe("2025-08-31");
  });
  it("getMonthEnd handles Feb in leap year", () => {
    expect(toIsoDate(getMonthEnd(d("2024-02-01")))).toBe("2024-02-29");
  });
  it("getMonthEnd handles Feb in non-leap year", () => {
    expect(toIsoDate(getMonthEnd(d("2025-02-01")))).toBe("2025-02-28");
  });
  it("getMonthEnd handles December", () => {
    expect(toIsoDate(getMonthEnd(d("2025-12-01")))).toBe("2025-12-31");
  });
});

// ─── getQuarterEnd ───────────────────────────────────────────────────────────

describe("getQuarterEnd", () => {
  it("Q1 Apr-Jun ends Jun 30", () => {
    expect(toIsoDate(getQuarterEnd(d("2025-04-01")))).toBe("2025-06-30");
  });
  it("Q2 Jul-Sep ends Sep 30", () => {
    expect(toIsoDate(getQuarterEnd(d("2025-07-01")))).toBe("2025-09-30");
  });
  it("Q3 Oct-Dec ends Dec 31", () => {
    expect(toIsoDate(getQuarterEnd(d("2025-10-01")))).toBe("2025-12-31");
  });
  it("Q4 Jan-Mar ends Mar 31", () => {
    expect(toIsoDate(getQuarterEnd(d("2026-01-01")))).toBe("2026-03-31");
  });
});

// ─── addMonths ────────────────────────────────────────────────────────────────

describe("addMonths", () => {
  it("adds months without crossing year", () => {
    expect(toIsoDate(addMonths(d("2025-04-01"), 3))).toBe("2025-07-01");
  });
  it("crosses year boundary", () => {
    expect(toIsoDate(addMonths(d("2025-11-01"), 3))).toBe("2026-02-01");
  });
  it("subtracts months", () => {
    expect(toIsoDate(addMonths(d("2025-02-01"), -3))).toBe("2024-11-01");
  });
});

// ─── label formatters ────────────────────────────────────────────────────────

describe("formatDayLabel", () => {
  it("formats day correctly", () => {
    expect(formatDayLabel(d("2025-08-14"))).toBe("14-Aug");
  });
  it("handles January", () => {
    expect(formatDayLabel(d("2025-01-01"))).toBe("1-Jan");
  });
});

describe("formatMonthLabel", () => {
  it("formats month label", () => {
    expect(formatMonthLabel(d("2025-08-01"))).toBe("Aug-25");
  });
  it("formats year correctly (2030)", () => {
    expect(formatMonthLabel(d("2030-04-01"))).toBe("Apr-30");
  });
});
