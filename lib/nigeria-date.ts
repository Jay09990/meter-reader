const NIGERIA_TIME_ZONE = "Africa/Lagos";

/** Return yesterday's Nigeria calendar date represented as UTC midnight. */
export function getYesterdayNigeriaDate(now = new Date()): Date {
  const dateParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: NIGERIA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const partValues = Object.fromEntries(dateParts.map(({ type, value }) => [type, value]));
  const year = Number(partValues.year);
  const month = Number(partValues.month);
  const day = Number(partValues.day);
  const yesterday = new Date(Date.UTC(year, month - 1, day - 1));
  return yesterday;
}
