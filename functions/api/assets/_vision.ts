import {
  parseProductVisualBrief,
  visualBriefPrompt,
  type ProductVisualCommercialBrief,
} from "../../../src/lib/al-rahma/product-visual-brief";
/**
 * Vision AI helpers for the Smart Asset Matcher.
 *
 * The dashboard uploads a photo of a bottle/box; this module reads the brand and
 * product name printed on the packaging and maps it to one D1 product id.
 *
 * Providers, in order:
 *   1. Google Gemini 2.5 Flash / 2.0 Flash (`GEMINI_API_KEY` secret).
 *   2. Cloudflare Workers AI `@cf/meta/llama-3.2-11b-vision-instruct`.
 *   3. Fuzzy filename matching (the Phase 19 v1 matcher), so the endpoint still
 *      returns something useful when no vision provider is bound.
 *
 * The model is never trusted blindly: its `productId` must exist in the loaded
 * D1 catalog, the returned text is capped, and the endpoint also returns the
 * top text-scored candidates so the operator can fix a wrong match in one click.
 */

import {
  matchProductsByFilename,
  normalizeMatchText,
  type MatchConfidence,
} from "../../../src/lib/al-rahma/filename-matcher";

export interface AiBinding {
  run: (model: string, input: Record<string, unknown>) => Promise<unknown>;
}

export interface VisionEnv {
  GEMINI_API_KEY?: string;
  AI?: AiBinding;
}

export interface VisionCatalogProduct {
  id: string;
  name_arabic: string;
  name_english: string | null;
  category: string | null;
  verification_status: string;
  brand_arabic: string;
  brand_english: string | null;
  brand_slug: string;
}

export interface VisionCandidate {
  productId: string;
  name_arabic: string;
  brand_arabic: string;
  score: number;
  confidence: MatchConfidence;
}

export interface VisionMatch {
  productId: string | null;
  confidence: MatchConfidence;
  detectedLabel: string;
  detectedBrand: string;
  detectedType: string;
  provider: "gemini" | "workers-ai" | "filename" | "none";
  reasoning: string;
  product: {
    id: string;
    name_arabic: string;
    brand_arabic: string;
    brand_slug: string;
  } | null;
  candidates: VisionCandidate[];
}

export interface VisionOutcome {
  match: VisionMatch;
  geminiConfigured: boolean;
  workersAiBound: boolean;
  note: string;
  /** Deep visual brief parsed from the provider reply; claims remain guarded. */
  visualBrief: ProductVisualCommercialBrief | null;
}

interface RawGuess {
  productId: string;
  confidence: MatchConfidence;
  detectedLabel: string;
  detectedBrand: string;
  detectedType: string;
  reasoning: string;
  /** Original guarded provider JSON, used only for the deep visual brief. */
  raw: Record<string, unknown>;
}

const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"];
const WORKERS_AI_MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";
const GEMINI_TIMEOUT_MS = 20_000;
const MAX_CATALOG_IN_PROMPT = 400;

const CONFIDENCE_VALUES: MatchConfidence[] = ["high", "medium", "low"];

function clampText(value: unknown, limit: number): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, limit);
}

function tokensFor(value: string): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const token of normalizeMatchText(value).split(" ")) {
    if (token.length < 2 || /^\d+$/.test(token) || seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
  }
  return tokens;
}

function looseTokenHit(left: string, right: string): boolean {
  if (left === right) return true;
  if (right.length >= 4 && left.includes(right)) return true;
  if (left.length >= 4 && right.includes(left)) return true;
  return false;
}

function confidenceForScore(score: number): MatchConfidence {
  if (score >= 0.7) return "high";
  if (score >= 0.45) return "medium";
  return "low";
}

/**
 * Scores one catalog product against free text (label + brand + filename).
 * Brand hits carry 0.4, product-name token coverage carries up to 0.6.
 */
function scoreProduct(
  queryText: string,
  product: VisionCatalogProduct,
): number {
  const queryTokens = tokensFor(queryText);
  if (queryTokens.length === 0) return 0;

  const brandTokens = tokensFor(
    `${product.brand_arabic} ${product.brand_english ?? ""}`,
  );
  const nameTokens = tokensFor(
    `${product.name_arabic} ${product.name_english ?? ""}`,
  );
  if (brandTokens.length === 0 && nameTokens.length === 0) return 0;

  let brandHit = false;
  const nameHits = new Set<string>();

  for (const token of queryTokens) {
    if (!brandHit && brandTokens.some((brand) => looseTokenHit(token, brand))) {
      brandHit = true;
      continue;
    }
    const hit = nameTokens.find((name) => looseTokenHit(token, name));
    if (hit) nameHits.add(hit);
  }

  const coverage = nameHits.size / Math.max(1, Math.min(2, nameTokens.length));
  let score = (brandHit ? 0.4 : 0) + Math.min(1, coverage) * 0.6;

  const normalizedQuery = normalizeMatchText(queryText);
  const normalizedName = normalizeMatchText(product.name_arabic);
  if (normalizedName.length >= 4 && normalizedQuery.includes(normalizedName)) {
    score = Math.max(score, 0.95);
  }

  return Math.round(Math.min(1, score) * 100) / 100;
}

function rankCandidates(
  queryText: string,
  catalog: readonly VisionCatalogProduct[],
  limit = 5,
): VisionCandidate[] {
  const ranked: VisionCandidate[] = [];
  for (const product of catalog) {
    const score = scoreProduct(queryText, product);
    if (score < 0.2) continue;
    ranked.push({
      productId: product.id,
      name_arabic: product.name_arabic,
      brand_arabic: product.brand_arabic,
      score,
      confidence: confidenceForScore(score),
    });
  }
  return ranked
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.name_arabic.localeCompare(right.name_arabic, "ar");
    })
    .slice(0, limit);
}

function promptFor(catalog: readonly VisionCatalogProduct[]): string {
  const rows = catalog
    .slice(0, MAX_CATALOG_IN_PROMPT)
    .map(
      (product) =>
        `${product.id} | ${product.brand_arabic} | ${product.name_arabic} | ${
          product.category ?? "-"
        }`,
    )
    .join("\n");

  return [
    "You are a product-packaging recognizer for an Egyptian pharmacy warehouse.",
    "Look at the bottle, box or sachet in the photo and read the brand and product name/type printed on the packaging.",
    "Then choose exactly one product from the CATALOG that matches what is printed on the pack.",
    "Never guess from the background. Only use text you can actually read on the packaging.",
    'Reply with JSON only, no markdown: {"productId":"<catalog id or empty string>","confidence":"high|medium|low","detectedLabel":"<text printed on the pack>","detectedBrand":"<brand printed on the pack>","detectedType":"<product type, e.g. shampoo>","reasoning":"<short reason>","identity":"<product identity>","primaryFunction":"<function if visibly stated>","dominantTones":[],"surfaceFinish":"<matte|glossy|metallic|glass|textile|mixed>","palette":[],"lightingMood":"<warm|cool-studio|high-contrast|natural-daylight>","shortSalesLine":"<truthful short Arabic phrase>"}',
    visualBriefPrompt("ar", "the product's own industry"),
    "If nothing in the CATALOG matches, return an empty productId and confidence low.",
    "",
    "CATALOG format: id | brand | product name | category",
    rows,
  ].join("\n");
}

function extractText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["response", "description", "text", "result"]) {
      const nested = record[key];
      if (typeof nested === "string" && nested.trim()) return nested;
    }
  }
  return "";
}

/** Finds the first balanced JSON object in a model reply. */
function extractJsonObject(text: string): Record<string, unknown> | null {
  if (!text) return null;
  const cleaned = text.replace(/```json/gi, "```").trim();

  const directStart = cleaned.indexOf("{");
  if (directStart < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = directStart; index < cleaned.length; index += 1) {
    const char = cleaned[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        const candidate = cleaned.slice(directStart, index + 1);
        try {
          const parsed = JSON.parse(candidate) as unknown;
          return parsed && typeof parsed === "object"
            ? (parsed as Record<string, unknown>)
            : null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function sanitizeGuess(value: Record<string, unknown> | null): RawGuess | null {
  if (!value) return null;

  const confidenceRaw = clampText(value.confidence, 10).toLowerCase();
  const confidence = CONFIDENCE_VALUES.includes(
    confidenceRaw as MatchConfidence,
  )
    ? (confidenceRaw as MatchConfidence)
    : "low";

  const guess: RawGuess = {
    productId: clampText(value.productId, 100),
    confidence,
    detectedLabel: clampText(
      value.detectedLabel ?? value.label ?? value.productName,
      300,
    ),
    detectedBrand: clampText(
      value.detectedBrand ?? value.brand ?? value.brandName,
      120,
    ),
    detectedType: clampText(
      value.detectedType ?? value.type ?? value.productType,
      120,
    ),
    reasoning: clampText(value.reasoning ?? value.reason, 400),
    raw: value,
  };

  if (
    !guess.productId &&
    !guess.detectedLabel &&
    !guess.detectedBrand &&
    !guess.detectedType
  ) {
    return null;
  }
  return guess;
}

/** Converts the guarded provider reply into a deep brief for staging and copy. */
function visualBriefFromGuess(
  guess: RawGuess,
  fileName: string,
): ProductVisualCommercialBrief {
  const fileStem = fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .trim();
  return parseProductVisualBrief(guess.raw, "ar", {
    identity: guess.detectedLabel || fileStem || "منتج جديد",
    category: guess.detectedType || "general",
    industry: guess.detectedType || guess.detectedBrand || "general",
  });
}

async function tryGemini(
  env: VisionEnv,
  image: { bytes: Uint8Array; mime: string; base64: string },
  catalog: readonly VisionCatalogProduct[],
): Promise<RawGuess | null> {
  const key = env.GEMINI_API_KEY?.trim();
  if (!key) return null;

  const prompt = promptFor(catalog);
  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: image.mime,
              data: image.base64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 700,
      responseMimeType: "application/json",
    },
  };

  for (const model of GEMINI_MODELS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": key,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        console.error(
          `Gemini vision (${model}) returned ${response.status}.`,
        );
        continue;
      }
      const payload = (await response.json()) as {
        candidates?: {
          content?: { parts?: { text?: string }[] };
        }[];
      };
      const text =
        payload.candidates?.[0]?.content?.parts
          ?.map((part) => part.text ?? "")
          .filter(Boolean)
          .join("\n") ?? "";
      const guess = sanitizeGuess(extractJsonObject(text));
      if (guess) return guess;
    } catch (error) {
      console.error(`Gemini vision (${model}) failed.`, error);
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

async function tryWorkersAi(
  env: VisionEnv,
  image: { bytes: Uint8Array; base64: string },
  catalog: readonly VisionCatalogProduct[],
): Promise<RawGuess | null> {
  if (!env.AI || typeof env.AI.run !== "function") return null;

  const prompt = promptFor(catalog);
  try {
    const result = await env.AI.run(WORKERS_AI_MODEL, {
      prompt,
      image: [...image.bytes],
      max_tokens: 700,
    });
    const guess = sanitizeGuess(extractJsonObject(extractText(result)));
    if (guess) return guess;
  } catch (error) {
    console.error("Workers AI vision match failed.", error);
  }
  return null;
}

function productSummary(
  product: VisionCatalogProduct | undefined,
): VisionMatch["product"] {
  if (!product) return null;
  return {
    id: product.id,
    name_arabic: product.name_arabic,
    brand_arabic: product.brand_arabic,
    brand_slug: product.brand_slug,
  };
}

function withChosenCandidate(
  candidates: VisionCandidate[],
  chosen: VisionCatalogProduct | undefined,
): VisionCandidate[] {
  if (!chosen) return candidates;
  if (candidates.some((item) => item.productId === chosen.id)) return candidates;
  return [
    {
      productId: chosen.id,
      name_arabic: chosen.name_arabic,
      brand_arabic: chosen.brand_arabic,
      score: 0.5,
      confidence: "medium" as const,
    },
    ...candidates,
  ].slice(0, 5);
}

function filenameFallback(
  fileName: string,
  catalog: readonly VisionCatalogProduct[],
): VisionMatch {
  const best = matchProductsByFilename(fileName, catalog)[0];
  if (!best) {
    return {
      productId: null,
      confidence: "low",
      detectedLabel: "",
      detectedBrand: "",
      detectedType: "",
      provider: "filename",
      reasoning: "لم يُعثر على مطابقة من اسم الملف.",
      product: null,
      candidates: [],
    };
  }
  return {
    productId: best.product.id,
    confidence: best.confidence,
    detectedLabel: "",
    detectedBrand: best.product.brand_arabic,
    detectedType: "",
    provider: "filename",
    reasoning: `مطابقة نصية من اسم الملف: ${best.matchedTokens.join(", ")}`,
    product: productSummary(best.product),
    candidates: rankCandidates(fileName, catalog),
  };
}

/**
 * Runs the vision providers in order and always returns a usable outcome.
 * The caller decides whether a null `productId` needs manual review.
 */
export async function predictProductFromImage(
  env: VisionEnv,
  image: { bytes: Uint8Array; mime: string; base64: string },
  fileName: string,
  catalog: readonly VisionCatalogProduct[],
): Promise<VisionOutcome> {
  const geminiConfigured = Boolean(env.GEMINI_API_KEY?.trim());
  const workersAiBound = Boolean(env.AI && typeof env.AI.run === "function");

  let guess = await tryGemini(env, image, catalog);
  let provider: VisionMatch["provider"] = guess ? "gemini" : "none";

  if (!guess) {
    guess = await tryWorkersAi(env, image, catalog);
    if (guess) provider = "workers-ai";
  }

  if (!guess) {
    const fallback = filenameFallback(fileName, catalog);
    return {
      match: fallback,
      geminiConfigured,
      workersAiBound,
      note: geminiConfigured || workersAiBound
        ? "تعذر قراءة العبوة بالذكاء الاصطناعي؛ تمت المطابقة من اسم الملف فقط."
        : "لم يُفعّل أي مزوّد رؤية (GEMINI_API_KEY أو Workers AI)؛ تمت المطابقة من اسم الملف فقط.",
      visualBrief: null,
    };
  }

  const visualBrief = visualBriefFromGuess(guess, fileName);
  const queryText = [
    guess.detectedLabel,
    guess.detectedBrand,
    guess.detectedType,
    fileName,
  ]
    .filter(Boolean)
    .join(" ");

  const candidates = rankCandidates(queryText, catalog);
  const chosenById = guess.productId
    ? catalog.find((product) => product.id === guess.productId)
    : undefined;

  if (!chosenById) {
    // The model may still have read the label correctly while returning an id
    // that is not in this catalog (hallucination or stale id). Fall back to the
    // label text, then to the filename.
    const bestText = candidates[0];
    const bestProduct = bestText
      ? catalog.find((product) => product.id === bestText.productId)
      : undefined;

    if (bestProduct && bestText) {
      return {
        match: {
          productId: bestProduct.id,
          confidence: bestText.confidence,
          detectedLabel: guess.detectedLabel,
          detectedBrand: guess.detectedBrand,
          detectedType: guess.detectedType,
          provider,
          reasoning: guess.reasoning,
          product: productSummary(bestProduct),
          candidates: withChosenCandidate(candidates, bestProduct),
        },
        geminiConfigured,
        workersAiBound,
        note: "معرّف المنتج من الرؤية لم يكن في الكتالوج؛ تمت المطابقة من النص المقروء على العبوة.",
        visualBrief,
      };
    }

    const fallback = filenameFallback(fileName, catalog);
    return {
      match: fallback,
      geminiConfigured,
      workersAiBound,
      note: fallback.productId
        ? "معرّف المنتج من الرؤية لم يكن في الكتالوج؛ تمت المطابقة من اسم الملف."
        : "لم يتم العثور على مطابقة واثقة؛ اختر المنتج يدوياً.",
      visualBrief: null,
    };
  }

  return {
    match: {
      productId: chosenById.id,
      confidence: guess.confidence,
      detectedLabel: guess.detectedLabel,
      detectedBrand: guess.detectedBrand,
      detectedType: guess.detectedType,
      provider,
      reasoning: guess.reasoning,
      product: productSummary(chosenById),
      candidates: withChosenCandidate(candidates, chosenById),
    },
    geminiConfigured,
    workersAiBound,
    note: "",
    visualBrief,
  };
}
