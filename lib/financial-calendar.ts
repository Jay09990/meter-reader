/**
 * lib/financial-calendar.ts
 *
 * Pure date-math helpers for the Indian financial year (Apr 1 → Mar 31).
 * No DB access — fully unit-testable.
 *
 * Financial year rule:
 *   Jan / Feb / Mar  →  FY start is April 1 of the PREVIOUS calendar year.
 *   Apr … Dec        →  FY start is April 1 of the CURRENT calendar year.
 *
 * All dates are normalised to UTC midnight to avoid timezone drift.
 */

// ─── Internal helpers ────────────────────────────────────────────────────────

/** Clamp a Date to UTC midnight (no time component). */
function utcDay(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Return April 1 of the financial year that contains `date`.
 *
 * @example
 *   getFinancialYearStart(new Date("2025-01-15")) // 2024-04-01
 *   getFinancialYearStart(new Date("2025-04-01")) // 2025-04-01
 *   getFinancialYearStart(new Date("2025-03-31")) // 2024-04-01
 */
export function getFinancialYearStart(date: Date): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth(); // 0-based
  // Jan(0) Feb(1) Mar(2) → prior calendar year's April
  const fyYear = m < 3 ? y - 1 : y;
  return utcDay(fyYear, 3, 1); // month 3 = April
}

/**
 * Return the first day of the FY quarter that contains `date`.
 *
 * FY quarters (month is 0-based):
 *   Q1  Apr–Jun  (3–5)
 *   Q2  Jul–Sep  (6–8)
 *   Q3  Oct–Dec  (9–11)
 *   Q4  Jan–Mar  (0–2)  ← belongs to the *next* calendar year in the FY sense
 *
 * @example
 *   getCurrentQuarterStart(new Date("2025-08-10")) // 2025-07-01  (Q2)
 *   getCurrentQuarterStart(new Date("2025-02-20")) // 2025-01-01  (Q4)
 *   getCurrentQuarterStart(new Date("2025-04-01")) // 2025-04-01  (Q1)
 */
export function getCurrentQuarterStart(date: Date): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();

  // Map month → quarter-start month (0-based)
  //   Jan(0),Feb(1),Mar(2) → Jan (0)
  //   Apr(3),May(4),Jun(5) → Apr (3)
  //   Jul(6),Aug(7),Sep(8) → Jul (6)
  //   Oct(9),Nov(10),Dec(11) → Oct (9)
  const quarterStartMonth = Math.floor(m / 3) * 3;
  return utcDay(y, quarterStartMonth, 1);
}

/**
 * Walk back `quartersAgo` FY quarters from the quarter containing `date`.
 *
 * A quarter is always exactly 3 months, so we subtract 3 months per step.
 *
 * @example
 *   // Today is 2025-08-10 (Q2 Jul-25)
 *   getQuarterStart(today, 0) // 2025-07-01
 *   getQuarterStart(today, 1) // 2025-04-01
 *   getQuarterStart(today, 2) // 2025-01-01
 *   getQuarterStart(today, 4) // 2024-07-01
 */
export function getQuarterStart(date: Date, quartersAgo: number): Date {
  const currentQStart = getCurrentQuarterStart(date);
  const y = currentQStart.getUTCFullYear();
  const m = currentQStart.getUTCMonth();
  // Subtract quartersAgo * 3 months
  const targetMonth = m - quartersAgo * 3;
  // Let Date handle month underflow (e.g. month -3 → previous year Oct)
  return utcDay(y, targetMonth, 1);
}

/**
 * Return the first day of the calendar month containing `date` (UTC midnight).
 *
 * @example
 *   getMonthStart(new Date("2025-08-19")) // 2025-08-01
 */
export function getMonthStart(date: Date): Date {
  return utcDay(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

/**
 * Add `months` calendar months to a UTC-midnight date.
 * Handles year wrapping correctly.
 */
export function addMonths(date: Date, months: number): Date {
  return utcDay(date.getUTCFullYear(), date.getUTCMonth() + months, 1);
}

/**
 * Return the last UTC day of the month containing `date`.
 *
 * @example
 *   getMonthEnd(new Date("2025-08-01")) // 2025-08-31
 */
export function getMonthEnd(date: Date): Date {
  // day 0 of the NEXT month = last day of this month
  return utcDay(date.getUTCFullYear(), date.getUTCMonth() + 1, 0);
}

/**
 * Return the last UTC day of the FY quarter that begins on `quarterStart`.
 * (Quarter is always exactly 3 months, so last day = first day of next quarter − 1.)
 */
export function getQuarterEnd(quarterStart: Date): Date {
  return utcDay(
    quarterStart.getUTCFullYear(),
    quarterStart.getUTCMonth() + 3, // first day of next quarter
    0,                               // day 0 = last day of previous month
  );
}

/**
 * Format a UTC Date as "DD-MMM" (e.g. "14-Aug") — used for daily bucket labels.
 */
export function formatDayLabel(date: Date): string {
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${date.getUTCDate()}-${MONTHS[date.getUTCMonth()]}`;
}

/**
 * Format a UTC Date as "MMM-YY" (e.g. "Aug-25") — used for monthly/quarterly labels.
 */
export function formatMonthLabel(date: Date): string {
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${MONTHS[date.getUTCMonth()]}-${String(date.getUTCFullYear()).slice(2)}`;
}

/**
 * Convert a Date to an ISO date string (YYYY-MM-DD) in UTC.
 */
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
