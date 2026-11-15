/**
 * Server-side calendar helpers for Pages Functions.
 *
 * Mirrors the pure helpers in `src/lib/al-rahma/dates.ts`. Kept independent so
 * the Functions bundle never imports application code; both copies share the
 * same ISO-day semantics and are covered by tests.
 */

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export const DEFAULT_TIME_ZONE = "Africa/Cairo";
export const DEFAULT_COUNTRY_CODE = "EG";
export const DEFAULT_LEAD_DAYS = 2;
export const MAX_LEAD_DAYS = 30;

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

export function cairoToday(
  now: Date = new Date(),
  timeZone: string = DEFAULT_TIME_ZONE,
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

export function addDays(isoDate: string, days: number): string {
  if (!isIsoDate(isoDate) || !Number.isFinite(days)) return isoDate;
  const [year, month, day] = isoDate.split("-").map(Number);
  const shifted = new Date(
    Date.UTC(year, month - 1, day) + Math.round(days) * MS_PER_DAY,
  );
  return shifted.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  if (!isIsoDate(from) || !isIsoDate(to)) return NaN;
  const [fromYear, fromMonth, fromDay] = from.split("-").map(Number);
  const [toYear, toMonth, toDay] = to.split("-").map(Number);
  return Math.round(
    (Date.UTC(toYear, toMonth - 1, toDay) -
      Date.UTC(fromYear, fromMonth - 1, fromDay)) /
      MS_PER_DAY,
  );
}

export function isWithinWindow(
  day: string,
  start: string,
  end: string,
): boolean {
  if (!isIsoDate(day) || !isIsoDate(start) || !isIsoDate(end)) return false;
  return start <= day && day <= end;
}

export function nextOccurrenceInWindow(
  occasionDate: string,
  today: string,
  leadDays: number,
): string | null {
  if (!isIsoDate(occasionDate) || !isIsoDate(today)) return null;

  const [, month, day] = occasionDate.split("-");
  const todayYear = Number(today.slice(0, 4));
  const lead = Math.max(
    0,
    Math.min(MAX_LEAD_DAYS, Math.round(Number.isFinite(leadDays) ? leadDays : 0)),
  );

  for (const year of [todayYear, todayYear + 1]) {
    const candidate = `${year}-${month}-${day}`;
    if (!isIsoDate(candidate)) continue;
    if (isWithinWindow(today, addDays(candidate, -lead), candidate)) {
      return candidate;
    }
  }

  return null;
}
