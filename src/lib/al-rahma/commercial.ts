import {
  daysBetween,
  isIsoDate,
  isWithinWindow,
  nextOccurrenceInWindow,
} from "./dates";

/**
 * Controlled commercial layer.
 *
 * Pricing is never invented here: a promotion is only valid when the stored
 * numbers are internally consistent (`promo_price` must equal the price derived
 * from `original_price` and `discount_percent`) and the record is active inside
 * its `[starts_at, ends_at]` window. Anything else is dropped, so a hallucinated
 * or stale price can never be rendered.
 */

export interface PromotionRecord {
  id: string;
  product_id: string;
  original_price: number;
  discount_percent: number;
  promo_price: number;
  starts_at: string;
  ends_at: string;
  is_active?: number | boolean | null;
}

export interface ValidPromotion {
  id: string;
  productId: string;
  originalPrice: number;
  discountPercent: number;
  promoPrice: number;
  savings: number;
  startsAt: string;
  endsAt: string;
}

export type PromotionEvaluation =
  | { status: "none" }
  | { status: "active"; promotion: ValidPromotion }
  | { status: "scheduled" }
  | { status: "expired" }
  | { status: "invalid"; reason: string };

export interface OccasionRecord {
  id: string;
  country_code?: string;
  occasion_name_arabic: string;
  greeting_text_arabic: string;
  occasion_date: string;
  lead_days?: number;
  accent_theme?: string | null;
  is_active?: number | boolean | null;
}

export interface OccasionGreetingInput {
  id: string;
  occasionName: string;
  greeting: string;
  occasionDate: string;
  daysUntil?: number;
  accentTheme?: string | null;
}

export const OCCASION_GREETING_PREFIX = "كل عام وأنتم بخير بمناسبة";

const PRICE_TOLERANCE = 0.011;

export function roundPrice(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Server and client both derive the final price the same deterministic way. */
export function calculatePromoPrice(
  originalPrice: number,
  discountPercent: number,
): number {
  return roundPrice(originalPrice * ((100 - discountPercent) / 100));
}

function isActiveFlag(value: number | boolean | null | undefined): boolean {
  return value === 1 || value === true;
}

function isValidPrice(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** Structural and numeric consistency of a promotion row. */
export function isValidPromotion(
  record: PromotionRecord | null | undefined,
): record is PromotionRecord {
  if (!record) return false;

  const discount = record.discount_percent;
  if (
    !isValidPrice(record.original_price) ||
    !isValidPrice(record.promo_price) ||
    !Number.isInteger(discount) ||
    discount < 1 ||
    discount > 99
  ) {
    return false;
  }

  if (!isIsoDate(record.starts_at) || !isIsoDate(record.ends_at)) return false;
  if (record.starts_at > record.ends_at) return false;

  const expected = calculatePromoPrice(record.original_price, discount);
  return Math.abs(expected - record.promo_price) <= PRICE_TOLERANCE;
}

/**
 * Classify a promotion for a given Cairo day.
 * - `invalid` blocks the creative (hallucinated numbers).
 * - `expired` / `scheduled` silently revert to the non-priced layout.
 */
export function evaluatePromotion(
  record: PromotionRecord | null | undefined,
  today: string,
): PromotionEvaluation {
  if (!record) return { status: "none" };

  if (!isValidPromotion(record)) {
    return {
      status: "invalid",
      reason:
        "بيانات العرض السعري غير متوافقة (السعر النهائي أو نسبة الخصم أو التواريخ).",
    };
  }

  if (!isIsoDate(today)) {
    return { status: "invalid", reason: "تاريخ اليوم غير صالح لحساب العرض." };
  }

  if (!isActiveFlag(record.is_active)) return { status: "expired" };
  if (today < record.starts_at) return { status: "scheduled" };
  if (today > record.ends_at) return { status: "expired" };

  const promotion: ValidPromotion = {
    id: record.id,
    productId: record.product_id,
    originalPrice: roundPrice(record.original_price),
    discountPercent: record.discount_percent,
    promoPrice: calculatePromoPrice(
      record.original_price,
      record.discount_percent,
    ),
    savings: roundPrice(
      record.original_price - record.promo_price,
    ),
    startsAt: record.starts_at,
    endsAt: record.ends_at,
  };

  return { status: "active", promotion };
}

export function resolveActivePromotion(
  record: PromotionRecord | null | undefined,
  today: string,
): ValidPromotion | null {
  const evaluation = evaluatePromotion(record, today);
  return evaluation.status === "active" ? evaluation.promotion : null;
}

/** Build the Arabic greeting line from a calendar row. */
export function buildOccasionGreeting(record: OccasionRecord): string {
  const greeting = (record.greeting_text_arabic ?? "").trim();
  if (greeting.startsWith("كل عام")) return greeting;

  const name = (record.occasion_name_arabic ?? "").trim();
  return name
    ? `${OCCASION_GREETING_PREFIX} ${name}`
    : OCCASION_GREETING_PREFIX;
}

/** Validate the greeting handed to the composer. */
export function normalizeOccasionInput(
  value: OccasionGreetingInput | null | undefined,
): OccasionGreetingInput | null {
  if (!value) return null;

  const greeting = (value.greeting ?? "").trim();
  const occasionName = (value.occasionName ?? "").trim();
  if (!greeting || !occasionName || !isIsoDate(value.occasionDate)) return null;

  return {
    id: value.id,
    occasionName,
    greeting,
    occasionDate: value.occasionDate,
    daysUntil: Number.isFinite(value.daysUntil)
      ? Math.round(value.daysUntil as number)
      : undefined,
    accentTheme: value.accentTheme ?? null,
  };
}

/**
 * Pick the closest active occasion whose lead window contains `today`.
 * Occasion dates recur annually, so a seeded 2027 date keeps working later.
 */
export function resolveUpcomingOccasion(
  records: OccasionRecord[],
  today: string,
): OccasionGreetingInput | null {
  if (!isIsoDate(today)) return null;

  let best: OccasionGreetingInput | null = null;

  for (const record of records) {
    if (record.is_active !== undefined && !isActiveFlag(record.is_active)) {
      continue;
    }
    if (!isIsoDate(record.occasion_date)) continue;

    const leadDays = Number.isFinite(record.lead_days)
      ? Math.max(0, Math.min(30, record.lead_days as number))
      : 2;
    const occurrence = nextOccurrenceInWindow(
      record.occasion_date,
      today,
      leadDays,
    );
    if (!occurrence) continue;

    const candidate: OccasionGreetingInput = {
      id: record.id,
      occasionName: record.occasion_name_arabic.trim(),
      greeting: buildOccasionGreeting(record),
      occasionDate: occurrence,
      daysUntil: Math.max(0, daysBetween(today, occurrence)),
      accentTheme: record.accent_theme ?? null,
    };

    if (!best || (candidate.daysUntil ?? 99) < (best.daysUntil ?? 99)) {
      best = candidate;
    }
  }

  return best;
}

export function isPromotionWindowActive(
  record: PromotionRecord,
  today: string,
): boolean {
  return (
    isActiveFlag(record.is_active) &&
    isWithinWindow(today, record.starts_at, record.ends_at)
  );
}
