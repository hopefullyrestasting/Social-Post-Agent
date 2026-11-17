/**
 * Filename → product matcher for bulk packshot uploads.
 *
 * Operators drop files straight from WhatsApp or a phone camera, so names are
 * noisy: `WhatsApp Image 2026-11-17 at 10.32.11.jpeg`, `IMG_1234.jpg`,
 * `شامبو-فاتيكا-زيتون.jpg`. This matcher normalizes Arabic and Latin text,
 * drops phone/chat noise, then scores brand and product-name token hits.
 *
 * It is intentionally conservative: a filename that only says "شامبو" is a low
 * confidence match and the dashboard asks the operator to pick the product
 * manually instead of guessing.
 */

export interface MatchableProduct {
  id: string;
  name_arabic: string;
  name_english?: string | null;
  brand_arabic?: string | null;
  brand_english?: string | null;
}

export type MatchConfidence = "high" | "medium" | "low";

export interface FilenameMatch<P extends MatchableProduct = MatchableProduct> {
  product: P;
  score: number;
  confidence: MatchConfidence;
  matchedTokens: string[];
}

const NOISE_TOKENS = new Set([
  "whatsapp",
  "whatsap",
  "whatsappimage",
  "image",
  "images",
  "img",
  "photo",
  "picture",
  "pictures",
  "screenshot",
  "screen",
  "copy",
  "final",
  "scaled",
  "download",
  "file",
  "at",
  "am",
  "pm",
  "jpeg",
  "jpg",
  "png",
  "webp",
  "heic",
  "heif",
  "avif",
  "صوره",
  "صور",
  "نسخه",
  "واتساب",
  "واتس",
  "تحميل",
  "ملف",
  "صورة",
]);

const ARABIC_DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;
const NON_ALPHANUMERIC = /[^\p{L}\p{N}]+/gu;

/** Lowercases, unifies Arabic letter shapes, and strips diacritics. */
export function normalizeMatchText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(ARABIC_DIACRITICS, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(NON_ALPHANUMERIC, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripExtension(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? fileName;
  const match = base.match(/^(.*?)(?:\.([a-z0-9]{2,5}))$/i);
  return match ? match[1] : base;
}

function tokenize(value: string): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const token of normalizeMatchText(value).split(" ")) {
    if (token.length < 2) continue;
    if (/^\d+$/.test(token)) continue;
    if (NOISE_TOKENS.has(token)) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
  }
  return tokens;
}

/** Arabic definite article variant: `الشامبو` also matches `شامبو`. */
function tokenVariants(token: string): string[] {
  if (token.startsWith("ال") && token.length > 4) {
    return [token, token.slice(2)];
  }
  return [token];
}

function tokensLooselyMatch(fileToken: string, targetToken: string): boolean {
  if (fileToken === targetToken) return true;
  if (targetToken.length >= 4 && fileToken.includes(targetToken)) return true;
  if (fileToken.length >= 4 && targetToken.includes(fileToken)) return true;
  return false;
}

function tokenHitsAny(fileToken: string, targets: Set<string>): boolean {
  for (const target of targets) {
    for (const variant of tokenVariants(target)) {
      if (tokensLooselyMatch(fileToken, variant)) return true;
    }
  }
  return false;
}

export function confidenceForScore(score: number): MatchConfidence {
  if (score >= 0.7) return "high";
  if (score >= 0.42) return "medium";
  return "low";
}

/** Returns candidate products for one filename, best first. */
export function matchProductsByFilename<P extends MatchableProduct>(
  fileName: string,
  products: readonly P[],
): FilenameMatch<P>[] {
  const fileTokens = tokenize(stripExtension(fileName));
  if (fileTokens.length === 0 || products.length === 0) return [];

  const matches: FilenameMatch<P>[] = [];

  for (const product of products) {
    const brandTokens = new Set(
      tokenize(
        `${product.brand_arabic ?? ""} ${product.brand_english ?? ""}`,
      ),
    );
    const nameTokens = new Set(
      tokenize(`${product.name_arabic} ${product.name_english ?? ""}`),
    );
    if (brandTokens.size === 0 && nameTokens.size === 0) continue;

    let brandHit = false;
    let nameHits = 0;
    const matchedTokens: string[] = [];

    for (const token of fileTokens) {
      if (tokenHitsAny(token, brandTokens)) {
        brandHit = true;
        matchedTokens.push(token);
        continue;
      }
      if (tokenHitsAny(token, nameTokens)) {
        nameHits += 1;
        matchedTokens.push(token);
      }
    }

    if (!brandHit && nameHits === 0) continue;

    // A brand-only filename is a real signal (0.45); product-name tokens add
    // up to 0.55 once two distinct words are covered.
    const coverage = nameHits / Math.max(1, Math.min(2, nameTokens.size));
    const score =
      (brandHit ? 0.45 : 0) + Math.min(1, coverage) * 0.55;

    if (score < 0.2) continue;

    matches.push({
      product,
      score: Math.round(score * 100) / 100,
      confidence: confidenceForScore(score),
      matchedTokens,
    });
  }

  return matches
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.product.name_arabic.localeCompare(
        right.product.name_arabic,
        "ar",
      );
    })
    .slice(0, 5);
}

/** Convenience wrapper for a single best match (or null). */
export function bestFilenameMatch<P extends MatchableProduct>(
  fileName: string,
  products: readonly P[],
): FilenameMatch<P> | null {
  return matchProductsByFilename(fileName, products)[0] ?? null;
}
