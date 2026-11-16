import { z } from "zod";
import { saveResearchRecord } from "../db/research/ingest";
import { validateRemoteImageUrl } from "./remove-bg";

/**
 * POST /api/ai/harvest-random (admin protected)
 *
 * Breaks the "same 5 verified products" loop: picks random products that still
 * need verification, finds a real packshot + source page from the live web
 * (Tavily when configured, DuckDuckGo otherwise), writes fact-checked Egyptian
 * Arabic benefit lines with Workers AI, and records everything through the same
 * idempotent research writer the dashboard already uses.
 *
 * Safety rules:
 * - A product is only marked verified when a real image URL loads as an image
 *   AND a real source page responds with content.
 * - Benefit copy is derived from fetched source snippets and filtered against
 *   prices, discounts, urgency, shipping, stock and medical claims.
 * - Nothing is deleted or overwritten destructively; previous primary images
 *   are demoted, claims are de-duplicated.
 */

export interface HarvestEnv {
  DB: D1Database;
  AI?: {
    run: (model: string, input: Record<string, unknown>) => Promise<unknown>;
  };
  TAVILY_API_KEY?: string;
  ADMIN_API_KEY?: string;
}

interface HarvestProductRow {
  id: string;
  name_arabic: string;
  name_english: string | null;
  category: string | null;
  subcategory: string | null;
  brand_id: string;
  brand_arabic: string;
  brand_english: string | null;
  brand_slug: string;
  official_website: string | null;
}

export interface WebResult {
  title: string;
  url: string;
  snippet: string;
}

export interface ImageCandidate {
  imageUrl: string;
  pageUrl: string;
  title: string;
  provider?: "tavily" | "duckduckgo" | "page-metadata";
}

export interface HarvestedProduct {
  productId: string;
  name: string;
  brand: string;
  category: string;
  imageUrl: string;
  sourceUrl: string;
  benefits: string[];
  imageProvider: "tavily" | "duckduckgo" | "page-metadata";
}

export interface SkippedProduct {
  productId: string;
  name: string;
  brand: string;
  reason: string;
}

export interface HarvestOutcome {
  harvested: HarvestedProduct[];
  skipped: SkippedProduct[];
}

const MODEL_TEXT_PRIMARY = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const MODEL_TEXT_FALLBACK = "@cf/meta/llama-3.1-8b-instruct";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const FORBIDDEN_TERMS = [
  "سعر",
  "جنيه",
  "ج.م",
  "خصم",
  "تخفيض",
  "عرض",
  "عروض",
  "شحن",
  "توصيل",
  "متوفر",
  "مخزون",
  "نفد",
  "علاج",
  "علاجي",
  "يعالج",
  "يشفي",
  "شفاء",
  "مرض",
  "طبيب",
  "مجانا",
  "مجاناً",
  "هدية",
  "%",
  "EGP",
  "LE ",
];

const CATEGORY_KEYWORDS: Array<[string, RegExp]> = [
  ["fragrance", /(عطر|عطور|برفان|فوحان|عود|مسك|perfume|fragrance|oud|parfum|eau de)/i],
  ["baby_care", /(أطفال|اطفال|طفل|بيبي|baby|kids|child)/i],
  ["hair_mask", /(ماسك|حمام كريم|mask|hair mask)/i],
  ["conditioner", /(بلسم|conditioner)/i],
  ["shampoo", /(شامبو|shampoo)/i],
  ["oil", /(زيت|زيوت|oil|serum|سيروم)/i],
  ["styling", /(تصفيف|جيل|موس|styling|gel|mousse|wax)/i],
  ["skincare", /(بشرة|كريم|مرطب|ترطيب|لوشن|skin|cream|moistur|lotion|aloe|ألو)/i],
];

function requestSchema() {
  return z
    .object({
      count: z.number().int().min(1).max(5).optional(),
    })
    .strict()
    .optional();
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&#x0*27;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) =>
      String.fromCodePoint(Number.parseInt(dec, 10)),
    );
}

function stripTags(value: string): string {
  return decodeEntities(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrl(href: string, base = "https://duckduckgo.com"): string | null {
  try {
    const url = new URL(href, base);
    const redirect = url.searchParams.get("uddg");
    if (redirect) {
      const redirectUrl = new URL(redirect);
      if (redirectUrl.protocol === "http:" || redirectUrl.protocol === "https:") {
        return redirectUrl.toString();
      }
    }
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString();
    }
  } catch {
    // ignore
  }
  return null;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 12_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Language": "ar-EG,ar;q=0.9,en;q=0.8",
        ...(init.headers as Record<string, string> | undefined),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

export function buildHarvestQuery(product: {
  brand_arabic?: string | null;
  brand_english?: string | null;
  name_arabic?: string | null;
  name_english?: string | null;
  category?: string | null;
}): string {
  const parts = [
    product.brand_arabic,
    product.brand_english,
    product.name_arabic,
    product.name_english,
    product.category,
  ]
    .map((part) => (part ?? "").trim())
    .filter(Boolean);
  return `${Array.from(new Set(parts)).join(" ")} صورة المنتج مصر`.trim();
}

export function inferCategory(product: {
  name_arabic?: string | null;
  name_english?: string | null;
  category?: string | null;
  subcategory?: string | null;
}): string {
  const existing = (product.category ?? "").trim();
  const haystack = [
    product.name_arabic,
    product.name_english,
    product.category,
    product.subcategory,
  ]
    .map((value) => (value ?? "").trim())
    .filter(Boolean)
    .join(" ");

  for (const [category, pattern] of CATEGORY_KEYWORDS) {
    if (pattern.test(haystack)) return category;
  }
  return existing || "other";
}

export function fallbackBenefits(category: string): string[] {
  switch (category) {
    case "shampoo":
    case "conditioner":
    case "hair_mask":
    case "oil":
    case "styling":
      return [
        "عناية يومية بسيطة بالشعر",
        "ملمس ناعم وسهل التسريح",
        "ضمن روتين العناية اليومي",
      ];
    case "fragrance":
      return [
        "عطر أنيق للمناسبات اليومية",
        "ثبات يدوم طوال اليوم",
        "تجربة عطرية مميزة كل يوم",
      ];
    case "baby_care":
      return [
        "عناية لطيفة يومية بالأطفال",
        "مناسب للاستخدام اليومي والعائلي",
        "خيار مطمئن للعناية اليومية",
      ];
    case "skincare":
      return [
        "عناية يومية بسيطة بالبشرة",
        "استخدام سهل وسريع كل يوم",
        "ضمن روتين ترطيب منتظم",
      ];
    default:
      return [
        "اختيار موثوق للعناية اليومية",
        "جودة مناسبة للاستخدام اليومي",
        "عناية بسيطة لكل يوم",
      ];
  }
}

export function isForbiddenClaim(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return FORBIDDEN_TERMS.some((term) => normalized.includes(term.toLowerCase()));
}

function cleanBenefitLine(value: string): string {
  return value
    .replace(/^[\s\-•*•\d.)"'\u2022]+/u, "")
    .replace(/[\s"'\u2022]+$/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

function wordCount(value: string): number {
  return value.split(/\s+/).filter(Boolean).length;
}

function hasArabic(value: string): boolean {
  return /[\u0600-\u06FF]/.test(value);
}

function extractCandidateLines(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((item): item is string => typeof item === "string");
  }
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.benefits)) {
      return obj.benefits.filter((item): item is string => typeof item === "string");
    }
  }
  if (typeof raw !== "string") return [];
  const text = raw.trim();
  if (!text) return [];

  const jsonStart = text.indexOf("[");
  const jsonEnd = text.lastIndexOf("]");
  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    try {
      const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === "string");
      }
    } catch {
      // fall through to line splitting
    }
  }

  return text
    .split(/\r?\n|[•]/)
    .map((line) => cleanBenefitLine(line))
    .filter(Boolean);
}

/**
 * Guarantees exactly three UI-safe Arabic benefit lines, each 4-8 words and
 * free of prices/discounts/urgency/shipping/stock/medical promises.
 */
export function sanitizeBenefitLines(raw: unknown, fallback: string[]): string[] {
  const cleaned: string[] = [];
  for (const candidate of extractCandidateLines(raw)) {
    const line = cleanBenefitLine(candidate);
    if (!line || !hasArabic(line)) continue;
    if (wordCount(line) < 4 || wordCount(line) > 8) continue;
    if (isForbiddenClaim(line)) continue;
    if (cleaned.includes(line)) continue;
    cleaned.push(line);
    if (cleaned.length === 3) break;
  }

  for (const candidate of fallback) {
    if (cleaned.length === 3) break;
    const line = cleanBenefitLine(candidate);
    if (!line || isForbiddenClaim(line) || cleaned.includes(line)) continue;
    cleaned.push(line);
  }

  for (const line of fallbackBenefits("other")) {
    if (cleaned.length === 3) break;
    if (!cleaned.includes(line) && !isForbiddenClaim(line)) cleaned.push(line);
  }

  return cleaned.slice(0, 3);
}

export function buildBenefitPrompt(
  product: { name_arabic: string; brand_arabic: string; category?: string | null },
  snippets: string[],
): string {
  const evidence = snippets
    .map((snippet, index) => `${index + 1}. ${snippet.slice(0, 600)}`)
    .join("\n");
  const fallback = fallbackBenefits(inferCategory(product));

  return [
    "أنت كاتب إعلانات مصري محترف لمتجر الرحمة.",
    "استخرج ثلاث عبارات فوائد قصيرة باللهجة المصرية الفصحى المبسطة من المصادر التالية فقط.",
    "كل عبارة من 4 إلى 8 كلمات عربية، بدون أسعار أو خصومات أو عروض أو شحن أو توصيل أو مخزون أو ادعاءات طبية.",
    "لا تخترع أي معلومة غير موجودة في المصادر. إن لم تكفِ المصادر، استخدم العبارات العامة الآمنة التالية:",
    fallback.join(" | "),
    `المنتج: ${product.name_arabic}`,
    `البراند: ${product.brand_arabic}`,
    `الفئة: ${product.category ?? inferCategory(product)}`,
    "المصادر:",
    evidence || "لا توجد مصادر نصية كافية.",
    'أعد فقط مصفوفة JSON بالشكل: ["عبارة أولى", "عبارة ثانية", "عبارة ثالثة"]',
  ].join("\n");
}

function extractAiText(result: unknown): string {
  if (typeof result === "string") return result;
  if (!result || typeof result !== "object") return "";
  const obj = result as Record<string, unknown>;
  for (const key of ["response", "result", "text", "output"]) {
    const value = obj[key];
    if (typeof value === "string") return value;
    if (value && typeof value === "object") {
      const nested = value as Record<string, unknown>;
      if (typeof nested.response === "string") return nested.response;
    }
  }
  return "";
}

async function synthesizeBenefits(
  env: HarvestEnv,
  product: HarvestProductRow,
  snippets: string[],
): Promise<string[]> {
  const fallback = fallbackBenefits(inferCategory(product));
  if (!env.AI || typeof env.AI.run !== "function") {
    return sanitizeBenefitLines([], fallback);
  }

  const prompt = buildBenefitPrompt(
    {
      name_arabic: product.name_arabic,
      brand_arabic: product.brand_arabic,
      category: product.category,
    },
    snippets,
  );

  for (const model of [MODEL_TEXT_PRIMARY, MODEL_TEXT_FALLBACK]) {
    try {
      const result = await env.AI.run(model, {
        prompt,
        max_tokens: 400,
        temperature: 0.2,
      });
      const text = extractAiText(result);
      if (!text) continue;
      const lines = sanitizeBenefitLines(text, fallback);
      if (lines.length === 3) return lines;
    } catch (error) {
      console.warn(`Workers AI benefit synthesis with ${model} failed.`, error);
    }
  }

  return sanitizeBenefitLines([], fallback);
}

function parseDuckDuckGoResults(html: string): WebResult[] {
  const results: WebResult[] = [];
  const snippets: string[] = [];

  const snippetRe = /<a\b([^>]*class="[^"]*result__snippet[^"]*"[^>]*)>([\s\S]*?)<\/a>/gi;
  let snippetMatch: RegExpExecArray | null;
  while ((snippetMatch = snippetRe.exec(html)) !== null) {
    snippets.push(stripTags(snippetMatch[2]));
  }

  const linkRe = /<a\b([^>]*class="[^"]*result__a[^"]*"[^>]*)>([\s\S]*?)<\/a>/gi;
  let linkMatch: RegExpExecArray | null;
  let index = 0;
  while ((linkMatch = linkRe.exec(html)) !== null) {
    const attrs = linkMatch[1];
    const hrefMatch = attrs.match(/\bhref="([^"]+)"/i) ?? attrs.match(/\bhref='([^']+)'/i);
    if (!hrefMatch) continue;
    const url = normalizeUrl(hrefMatch[1]);
    if (!url) continue;
    if (/duckduckgo\.com\/y\.js|javascript:/i.test(url)) continue;
    const title = stripTags(linkMatch[2]);
    if (!title) continue;
    results.push({ title, url, snippet: snippets[index] ?? title });
    index += 1;
    if (results.length >= 8) break;
  }

  return results;
}

async function searchDuckDuckGo(query: string): Promise<WebResult[]> {
  const results: WebResult[] = [];

  try {
    const response = await fetchWithTimeout(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=eg-ar`,
      { method: "GET", headers: { Accept: "text/html" } },
      12_000,
    );
    if (response.ok) {
      results.push(...parseDuckDuckGoResults(await response.text()));
    }
  } catch (error) {
    console.warn("DuckDuckGo HTML search failed.", error);
  }

  if (results.length < 3) {
    try {
      const response = await fetchWithTimeout(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
        { method: "GET", headers: { Accept: "application/json" } },
        10_000,
      );
      if (response.ok) {
        const payload = (await response.json()) as {
          AbstractURL?: string;
          AbstractText?: string;
          Heading?: string;
          RelatedTopics?: Array<
            | { FirstURL?: string; Text?: string }
            | { Topics?: Array<{ FirstURL?: string; Text?: string }> }
          >;
        };
        if (payload.AbstractURL && payload.AbstractText) {
          results.push({
            title: payload.Heading ?? query,
            url: payload.AbstractURL,
            snippet: payload.AbstractText,
          });
        }
        for (const topic of payload.RelatedTopics ?? []) {
          if ("FirstURL" in topic && topic.FirstURL && topic.Text) {
            results.push({ title: topic.Text, url: topic.FirstURL, snippet: topic.Text });
          } else if ("Topics" in topic && Array.isArray(topic.Topics)) {
            for (const nested of topic.Topics) {
              if (nested.FirstURL && nested.Text) {
                results.push({
                  title: nested.Text,
                  url: nested.FirstURL,
                  snippet: nested.Text,
                });
              }
            }
          }
        }
      }
    } catch (error) {
      console.warn("DuckDuckGo instant answer search failed.", error);
    }
  }

  return dedupeResults(results).slice(0, 8);
}

function dedupeResults(results: WebResult[]): WebResult[] {
  const seen = new Set<string>();
  const deduped: WebResult[] = [];
  for (const result of results) {
    if (!result.url || seen.has(result.url)) continue;
    seen.add(result.url);
    deduped.push(result);
  }
  return deduped;
}

interface TavilyPayload {
  results?: Array<{ title?: string; url?: string; content?: string }>;
  images?: Array<string | { url?: string; image?: string }>;
}

async function searchTavily(
  key: string,
  query: string,
): Promise<{ results: WebResult[]; images: string[] }> {
  const response = await fetchWithTimeout(
    "https://api.tavily.com/search",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        api_key: key,
        query,
        search_depth: "basic",
        include_images: true,
        include_answer: false,
        max_results: 6,
      }),
    },
    15_000,
  );

  if (!response.ok) {
    throw new Error(`Tavily returned HTTP ${response.status}`);
  }

  const payload = (await response.json()) as TavilyPayload;
  const results = (payload.results ?? [])
    .map((entry) => ({
      title: (entry.title ?? "").trim(),
      url: normalizeUrl(entry.url ?? "") ?? "",
      snippet: (entry.content ?? "").trim(),
    }))
    .filter((entry) => entry.url && entry.title);

  const images = (payload.images ?? [])
    .map((entry) => (typeof entry === "string" ? entry : entry.url ?? entry.image ?? ""))
    .map((url) => normalizeUrl(url))
    .filter((url): url is string => Boolean(url));

  return { results: dedupeResults(results).slice(0, 8), images };
}

function extractVqd(html: string): string | null {
  const patterns = [
    /vqd=["']?([\d-]+)/i,
    /vqd=([\d-]+)&/i,
    /"vqd"\s*:\s*"([\d-]+)"/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[1];
  }
  return null;
}

async function searchDuckDuckGoImages(query: string): Promise<string[]> {
  try {
    const landing = await fetchWithTimeout(
      `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images&kl=eg-ar`,
      { method: "GET", headers: { Accept: "text/html" } },
      12_000,
    );
    if (!landing.ok) return [];
    const html = await landing.text();
    const vqd = extractVqd(html);
    if (!vqd) return [];

    const response = await fetchWithTimeout(
      `https://duckduckgo.com/i.js?l=eg-ar&o=json&q=${encodeURIComponent(
        query,
      )}&vqd=${encodeURIComponent(vqd)}&f=,,,&p=1`,
      {
        method: "GET",
        headers: { Accept: "application/json", Referer: "https://duckduckgo.com/" },
      },
      12_000,
    );
    if (!response.ok) return [];
    const payload = (await response.json()) as {
      results?: Array<{ image?: string; thumbnail?: string; url?: string; title?: string }>;
    };
    return (payload.results ?? [])
      .map((entry) => entry.image ?? entry.thumbnail ?? "")
      .map((url) => normalizeUrl(url))
      .filter((url): url is string => Boolean(url))
      .slice(0, 20);
  } catch (error) {
    console.warn("DuckDuckGo image search failed.", error);
    return [];
  }
}

export function extractPageImages(html: string, pageUrl: string): string[] {
  const images: string[] = [];
  const patterns = [
    /<meta[^>]+(?:property|name)=["'](?:og:image|og:image:secure_url|twitter:image)["'][^>]*content=["']([^"']+)["']/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|og:image:secure_url|twitter:image)["']/gi,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html)) !== null) {
      const url = normalizeUrl(match[1], pageUrl);
      if (url) images.push(url);
    }
  }
  return Array.from(new Set(images));
}

async function pageImages(pageUrl: string): Promise<string[]> {
  try {
    const response = await fetchWithTimeout(
      pageUrl,
      { method: "GET", headers: { Accept: "text/html,application/xhtml+xml" } },
      12_000,
    );
    if (!response.ok) return [];
    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (contentType && !contentType.includes("html")) return [];
    return extractPageImages(await response.text(), pageUrl);
  } catch {
    return [];
  }
}

async function verifyImageUrl(url: string, referer?: string): Promise<boolean> {
  const validation = validateRemoteImageUrl(url);
  if (!validation.ok) return false;
  try {
    const response = await fetchWithTimeout(
      url,
      {
        method: "GET",
        headers: {
          Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8",
          ...(referer ? { Referer: referer } : {}),
        },
      },
      12_000,
    );
    if (!response.ok) return false;
    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (!contentType.startsWith("image/")) return false;
    const length = Number(response.headers.get("content-length") ?? "0");
    if (Number.isFinite(length) && length > 0 && length < 2048) return false;
    const bytes = await response.arrayBuffer();
    return bytes.byteLength >= 2048;
  } catch {
    return false;
  }
}

async function verifySourcePage(url: string): Promise<boolean> {
  const validation = validateRemoteImageUrl(url);
  if (!validation.ok) return false;
  try {
    const response = await fetchWithTimeout(
      url,
      { method: "GET", headers: { Accept: "text/html,application/xhtml+xml" } },
      12_000,
    );
    if (!response.ok) return false;
    const bytes = await response.arrayBuffer();
    return bytes.byteLength > 200;
  } catch {
    return false;
  }
}

function hostMatchesBrand(sourceUrl: string, product: HarvestProductRow): boolean {
  try {
    const sourceHost = new URL(sourceUrl).hostname.replace(/^www\./i, "").toLowerCase();
    const officialHost = product.official_website
      ? new URL(product.official_website).hostname.replace(/^www\./i, "").toLowerCase()
      : "";
    if (officialHost && (sourceHost === officialHost || sourceHost.endsWith(`.${officialHost}`))) {
      return true;
    }
    const brandToken = (product.brand_english ?? product.brand_slug ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    const hostToken = sourceHost.replace(/[^a-z0-9]/g, "");
    return brandToken.length >= 3 && hostToken.includes(brandToken);
  } catch {
    return false;
  }
}

async function findPackshot(
  env: HarvestEnv,
  query: string,
  results: WebResult[],
  tavilyImages: string[],
): Promise<ImageCandidate | null> {
  const candidates: ImageCandidate[] = [];
  const seen = new Set<string>();

  const push = (
    imageUrl: string,
    pageUrl: string,
    title: string,
    provider: ImageCandidate["provider"],
  ) => {
    if (!imageUrl || seen.has(imageUrl)) return;
    if (/\.svg(\?|$)/i.test(imageUrl)) return;
    seen.add(imageUrl);
    candidates.push({ imageUrl, pageUrl, title, provider });
  };

  for (const imageUrl of tavilyImages) {
    push(imageUrl, results[0]?.url ?? "", results[0]?.title ?? query, "tavily");
  }

  const ddgImages = await searchDuckDuckGoImages(query);
  for (const imageUrl of ddgImages) {
    push(imageUrl, results[0]?.url ?? "", results[0]?.title ?? query, "duckduckgo");
  }

  for (const result of results.slice(0, 3)) {
    for (const imageUrl of await pageImages(result.url)) {
      push(imageUrl, result.url, result.title, "page-metadata");
    }
  }

  for (const candidate of candidates.slice(0, 12)) {
    if (await verifyImageUrl(candidate.imageUrl, candidate.pageUrl || undefined)) {
      return {
        imageUrl: candidate.imageUrl,
        pageUrl: candidate.pageUrl || results[0]?.url || "",
        title: candidate.title,
        provider: candidate.provider,
      };
    }
  }

  void env;
  return null;
}

async function harvestOne(
  env: HarvestEnv,
  product: HarvestProductRow,
): Promise<{ ok: true; data: HarvestedProduct } | { ok: false; reason: string }> {
  const query = buildHarvestQuery(product);

  let results: WebResult[] = [];
  let tavilyImages: string[] = [];

  const tavilyKey = env.TAVILY_API_KEY?.trim();
  if (tavilyKey) {
    try {
      const tavily = await searchTavily(tavilyKey, query);
      results = tavily.results;
      tavilyImages = tavily.images;
    } catch (error) {
      console.warn("Tavily harvest search failed; falling back to DuckDuckGo.", error);
    }
  }

  if (results.length === 0) {
    results = await searchDuckDuckGo(query);
  }

  if (results.length === 0) {
    return { ok: false, reason: "لم يتم العثور على نتائج بحث للمنتج." };
  }

  const packshot = await findPackshot(env, query, results, tavilyImages);
  if (!packshot) {
    return { ok: false, reason: "لم يتم العثور على صورة عبوة حقيقية قابلة للتحميل." };
  }

  const sourceCandidates = dedupeResults([
    ...(packshot.pageUrl
      ? [
          {
            title: packshot.title,
            url: packshot.pageUrl,
            snippet: results.find((result) => result.url === packshot.pageUrl)?.snippet ?? "",
          },
        ]
      : []),
    ...results,
  ]);

  let sourceUrl = "";
  for (const candidate of sourceCandidates.slice(0, 5)) {
    if (await verifySourcePage(candidate.url)) {
      sourceUrl = candidate.url;
      break;
    }
  }

  if (!sourceUrl) {
    return { ok: false, reason: "لم يتم التحقق من صفحة مصدر حقيقية للمنتج." };
  }

  const snippets = results
    .slice(0, 4)
    .map((result) => result.snippet)
    .filter((snippet) => snippet.length > 0);
  const benefits = await synthesizeBenefits(env, product, snippets);
  const category = inferCategory(product);
  const sourceName = (() => {
    try {
      return new URL(sourceUrl).hostname.replace(/^www\./i, "");
    } catch {
      return product.brand_arabic;
    }
  })();

  const saved = await saveResearchRecord(env, {
    product_id: product.id,
    source_name: sourceName,
    source_url: sourceUrl,
    source_type: hostMatchesBrand(sourceUrl, product) ? "manufacturer" : "retailer",
    image_url: packshot.imageUrl,
    verified_claims: benefits.map((claimText) => ({
      claim_type: "benefit" as const,
      claim_text: claimText,
    })),
  });

  if (!saved.ok) {
    return { ok: false, reason: saved.error };
  }

  // Fill a missing category without touching an already-curated one.
  if (!product.category || !product.category.trim()) {
    await env.DB.prepare(
      `UPDATE products
       SET category = CASE WHEN category IS NULL OR TRIM(category) = '' THEN ? ELSE category END,
           updated_at = ?
       WHERE id = ?`,
    )
      .bind(category, Date.now(), product.id)
      .run();
  }

  return {
    ok: true,
    data: {
      productId: product.id,
      name: product.name_arabic,
      brand: product.brand_arabic,
      category,
      imageUrl: packshot.imageUrl,
      sourceUrl,
      benefits,
      imageProvider: packshot.provider ?? "page-metadata",
    },
  };
}

export async function harvestRandomProducts(
  env: HarvestEnv,
  count = 5,
): Promise<HarvestOutcome> {
  const limit = Math.max(1, Math.min(5, Math.trunc(count)));
  const rows = await env.DB.prepare(
    `SELECT p.id, p.name_arabic, p.name_english, p.category, p.subcategory,
            p.brand_id, b.name_arabic AS brand_arabic,
            b.name_english AS brand_english, b.slug AS brand_slug,
            b.official_website
     FROM products p
     JOIN brands b ON b.id = p.brand_id
     WHERE p.verification_status = 'needs_verification'
     ORDER BY RANDOM()
     LIMIT ?`,
  )
    .bind(limit)
    .all<HarvestProductRow>();

  const harvested: HarvestedProduct[] = [];
  const skipped: SkippedProduct[] = [];

  for (const product of rows.results) {
    try {
      const outcome = await harvestOne(env, product);
      if (outcome.ok) {
        harvested.push(outcome.data);
      } else {
        skipped.push({
          productId: product.id,
          name: product.name_arabic,
          brand: product.brand_arabic,
          reason: outcome.reason,
        });
      }
    } catch (error) {
      console.error(`Harvest failed for product ${product.id}.`, error);
      skipped.push({
        productId: product.id,
        name: product.name_arabic,
        brand: product.brand_arabic,
        reason: "خطأ غير متوقع أثناء التوثيق.",
      });
    }
  }

  return { harvested, skipped };
}

export const onRequestPost: PagesFunction<HarvestEnv> = async ({ request, env }) => {
  let payload: unknown = undefined;
  try {
    const text = await request.text();
    payload = text ? JSON.parse(text) : undefined;
  } catch {
    return Response.json(
      { success: false, error: "Request body must be valid JSON." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const parsed = requestSchema().safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      { success: false, error: "Invalid request payload." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const requested = parsed.data?.count ?? 5;

  try {
    const outcome = await harvestRandomProducts(env, requested);
    const harvested = outcome.harvested.length;
    const skipped = outcome.skipped.length;
    const message =
      harvested > 0
        ? `تم توثيق ${harvested} منتجاً جديداً عشوائياً${skipped ? ` وتخطي ${skipped}` : ""}. الآن يمكنك توليد دفعة جديدة بتنوع أكبر.`
        : skipped > 0
          ? `لم يكتمل توثيق أي منتج (${skipped} محاولة). جرّب مرة أخرى أو راجع اتصال الشبكة/مفتاح Tavily.`
          : "لا توجد منتجات تحتاج إلى توثيق حالياً.";

    return Response.json(
      {
        success: true,
        requested,
        harvestedCount: harvested,
        skippedCount: skipped,
        harvested: outcome.harvested,
        skipped: outcome.skipped,
        message,
      },
      { headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" } },
    );
  } catch (error) {
    console.error("Failed to harvest random products.", error);
    return Response.json(
      { success: false, error: "Unable to harvest random products." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
};
