/**
 * Pure calendar helpers shared by the copy engine, the ad composer and the
 * dashboard. Everything here is timezone-aware (Africa/Cairo) and dependency
 * free so it can be serialized or copied into a future brand package.
 *
 * Dates are handled as ISO calendar days (`YYYY-MM-DD`). String comparison is
 * safe for that format, and all arithmetic happens on UTC day numbers to avoid
 * daylight-saving drift.
 */

export const CAIRO_TIME_ZONE = "Africa/Cairo";

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

/** True when `value` is a real calendar day in `YYYY-MM-DD` form. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** The current calendar day in the configured timezone. */
export function cairoToday(
  now: Date = new Date(),
  timeZone: string = CAIRO_TIME_ZONE,
): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const pick = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

/** Shift an ISO calendar day by whole days. */
export function addDays(isoDate: string, days: number): string {
  if (!isIsoDate(isoDate) || !Number.isFinite(days)) return isoDate;
  const [year, month, day] = isoDate.split("-").map(Number);
  const shifted = new Date(
    Date.UTC(year, month - 1, day) + Math.round(days) * MS_PER_DAY,
  );
  return shifted.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  if (!isIsoDate(from) || !isIsoDate(to)) return NaN;
  const [fromYear, fromMonth, fromDay] = from.split("-").map(Number);
  const [toYear, toMonth, toDay] = to.split("-").map(Number);
  const fromStamp = Date.UTC(fromYear, fromMonth - 1, fromDay);
  const toStamp = Date.UTC(toYear, toMonth - 1, toDay);
  return Math.round((toStamp - fromStamp) / MS_PER_DAY);
}

/** Inclusive window check: `start <= day <= end`. */
export function isWithinWindow(
  day: string,
  start: string,
  end: string,
): boolean {
  if (!isIsoDate(day) || !isIsoDate(start) || !isIsoDate(end)) return false;
  return start <= day && day <= end;
}

/**
 * Resolve the next annual occurrence of a recurring occasion that falls
 * inside its lead window. Returns the occurrence date or `null`.
 */
export function nextOccurrenceInWindow(
  occasionDate: string,
  today: string,
  leadDays: number,
): string | null {
  if (!isIsoDate(occasionDate) || !isIsoDate(today)) return null;

  const [, month, day] = occasionDate.split("-");
  const todayYear = Number(today.slice(0, 4));
  const lead = Math.max(0, Math.round(Number.isFinite(leadDays) ? leadDays : 0));

  for (const year of [todayYear, todayYear + 1]) {
    const candidate = `${year}-${month}-${day}`;
    if (!isIsoDate(candidate)) continue; // e.g. 29 February outside a leap year
    if (isWithinWindow(today, addDays(candidate, -lead), candidate)) {
      return candidate;
    }
  }

  return null;
}
