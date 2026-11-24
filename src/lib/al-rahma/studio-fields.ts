/**
 * Validation helpers for the Basic Studio's operator-owned product fields.
 *
 * These fields are optional metadata, not research claims:
 * - `salesLine` is a short, punchy, claim-free phrase stored in the existing
 *   `products.description` column.
 * - `offerText` is operator-entered offer metadata stored in the existing
 *   `business_settings` table through a tenant-namespaced key.
 * - `price` is an explicit numeric value; absent values stay absent.
 *
 * Nothing here invents benefits, prices, urgency or shipping promises. Risky
 * phrases are rejected before storage and again by the Quality Gate.
 */

export const MAX_SALES_LINE_LENGTH = 120;
export const MAX_OFFER_LENGTH = 100;

const PRICE_TERMS = [
  "خصم",
  "تخفيض",
  "السعر",
  "سعر",
  "جنيه",
  "ج.م",
  "EGP",
  "LE",
  "%",
  "٪",
];

const RISKY_CLAIM_PATTERNS: RegExp[] = [
  /علاج|يعالج|شفاء|يداوي|طبي|طبية/i,
  /مضمون|ضمان|نتائج مضمونة/i,
  /بدون\s+أي\s+آثار\s+جانبية|بدون\s+مخاطر/i,
  /أفضل|الأفضل|رقم\s*١|رقم\s*1|no\.?\s*1/i,
  /توصيل\s+مجاني|شحن\s+مجاني|شحن\s+سريع/i,
];

const URGENCY_TERMS = [
  "لفترة محدودة",
  "الكمية محدودة",
  "ينتهي قريباً",
  "فقط",
  "الآن",
  "urgent",
  "hurry",
  "last chance",
];

function collapse(value: string): string {
  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsAny(value: string, terms: readonly string[]): boolean {
  const normalized = value.toLocaleLowerCase();
  return terms.some((term) => normalized.includes(term.toLocaleLowerCase()));
}

function hasRiskyClaim(value: string): boolean {
  return RISKY_CLAIM_PATTERNS.some((pattern) => pattern.test(value));
}

function countWords(value: string): number {
  return value.split(/\s+/).filter(Boolean).length;
}

/** True only for short, claim-free, price-free sales phrases. */
export function isSafeSalesLine(value: string | null | undefined): boolean {
  const clean = collapse(value ?? "");
  if (!clean || clean.length > MAX_SALES_LINE_LENGTH) return false;
  if (countWords(clean) < 3 || countWords(clean) > 8) return false;
  if (containsAny(clean, PRICE_TERMS) || containsAny(clean, URGENCY_TERMS)) return false;
  return !hasRiskyClaim(clean);
}

/**
 * Normalizes an operator-uploaded sales line. Unsafe input is dropped rather
 * than rewritten into a claim; the caller falls back to a generic phrase.
 */
export function sanitizeSalesLine(value: string | null | undefined): string {
  const clean = collapse(value ?? "");
  if (!clean) return "";
  if (!isSafeSalesLine(clean)) return "";
  return clean.split(/\s+/).slice(0, 8).join(" ");
}

/**
 * Operator input wins; a vision-derived brief may only contribute a short,
 * claim-free sales line after passing the same guard. Unsafe analysis is
 * dropped instead of being rewritten into a claim.
 */
export function resolveSalesLine(input: {
  salesLine?: string | null;
  visualBrief?: { shortSalesLine?: string | null } | null;
}): string {
  const explicit = isSafeSalesLine(input.salesLine)
    ? sanitizeSalesLine(input.salesLine)
    : "";
  if (explicit) return explicit;
  const fromBrief = isSafeSalesLine(input.visualBrief?.shortSalesLine)
    ? sanitizeSalesLine(input.visualBrief?.shortSalesLine)
    : "";
  return fromBrief;
}

/**
 * Deterministic sales line derived only from observed labels/category/files.
 * It describes the product category, never an unverified benefit.
 */
export function buildStudioSalesLine(input: {
  detectedLabel?: string | null;
  detectedType?: string | null;
  tenantIndustry?: string | null;
  fileName?: string | null;
}): string {
  const fileStem = (input.fileName ?? "")
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const source = [input.detectedType, input.tenantIndustry, fileStem, input.detectedLabel]
    .map((item) => collapse(item ?? ""))
    .find((item) => item.length > 0);
  if (!source) return "منتج مختار بعناية لك";
  const category = source.split(/\s+/).slice(0, 3).join(" ");
  const candidate = `جودة ${category} مميزة لك`;
  return sanitizeSalesLine(candidate) || "منتج مختار بعناية لك";
}

/** Explicit offer metadata may contain a price, but no medical/urgency claims. */
export function isSafeOfferText(value: string | null | undefined): boolean {
  const clean = collapse(value ?? "");
  if (!clean || clean.length > MAX_OFFER_LENGTH) return false;
  if (containsAny(clean, URGENCY_TERMS)) return false;
  return !hasRiskyClaim(clean);
}

export function sanitizeOfferText(value: string | null | undefined): string {
  const clean = collapse(value ?? "");
  return isSafeOfferText(clean) ? clean : "";
}

/** Validates visual price metadata; the numeric part must be explicit. */
export function isValidPriceText(value: string | null | undefined): boolean {
  const clean = collapse(value ?? "");
  if (!clean || clean.length > 40) return false;
  const match = /^(\d+(?:[.,]\d{1,2})?)/.exec(clean);
  if (!match) return false;
  const amount = Number(match[1].replace(",", "."));
  return Number.isFinite(amount) && amount > 0;
}

export function formatPriceText(price: number, currencyLabel: string): string {
  if (!Number.isFinite(price) || price <= 0) return "";
  const value = Number.isInteger(price) ? String(price) : price.toFixed(2);
  const currency = collapse(currencyLabel);
  return currency ? `${value} ${currency}` : value;
}
