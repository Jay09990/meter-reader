import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a timestamp from the DB as local time.
 *
 * The DB uses TIMESTAMP WITHOUT TIME ZONE — values are stored as-is in local
 * time (IST). Prisma serialises them to ISO strings ending in "Z", which makes
 * the browser treat them as UTC and shift by +5:30. We strip the trailing "Z"
 * so the Date constructor parses the literal value without any offset, then
 * render with toLocaleString() in the user's local locale.
 */
export function formatLocalTs(isoStr: string | null | undefined): string {
  if (!isoStr) return "—";
  // Remove trailing "Z" or any "+00:00" so JS treats it as local, not UTC.
  const localStr = isoStr.replace(/Z$/, "").replace(/\+00:00$/, "");
  const d = new Date(localStr);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

/**
 * Same as formatLocalTs but returns date-only (no time portion).
 */
export function formatLocalDate(isoStr: string | null | undefined): string {
  if (!isoStr) return "—";
  const localStr = isoStr.replace(/Z$/, "").replace(/\+00:00$/, "");
  const d = new Date(localStr);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}
