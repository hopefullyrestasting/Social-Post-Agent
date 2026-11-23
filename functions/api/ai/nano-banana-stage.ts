/**
 * POST /api/ai/nano-banana-stage
 *
 * Background-only photorealistic stage generation via Google Gemini image
 * generation ("Nano Banana").
 *
 * IMPORTANT: this endpoint is text-to-image only and produces a clean background
 * plate; it never receives the product photo. Reference-conditioned product
 * compositing (the authentic cutout as an img2img conditioning input) lives in
 * `/api/ai/product-composite` under the updated AGENTS.md rule #4. This
 * background-only path remains the fallback when no compositing provider is
 * available, and the authentic packshot is then composited by the SVG overlay
 * (`packshot-hero`).
 */

export interface NanoBananaEnv {
  GEMINI_API_KEY?: string;
}

export type NanoBananaStageProvider = "nano-banana" | "studio-fallback";

type TemplateId =
  | "simple-botanical-horizon"
  | "silver-podium-botanical"
  | "botanical-arch-frame"
  | "editorial-beauty-card";

export interface NanoBananaArtDirection {
  brand?: string | null;
  industry?: string | null;
  category?: string | null;
  name?: string | null;
  benefits?: string[] | null;
}

const MODEL_PRIMARY = "gemini-2.5-flash-image";
const MODEL_FALLBACK = "gemini-2.0-flash-exp-image-generation";

/**
 * Hard background-only contract. Every generated plate has to stay free of the
 * product so the real packshot can be placed on top without duplication.
 */
const BACKGROUND_ONLY_SUFFIX =
  "Pure empty background plate for a commercial beauty advertisement: no product, no bottle, no jar, no tube, no box, no sachet, no packaging, no label, no cap, no text, no letters, no logo, no watermark anywhere in the frame. No podium, no plinth, no pedestal, no stage, no platform, no table, no shelf. Keep the central area open, softly lit and uncluttered so a real product packshot can be composited on top later, with generous clean negative space at the top for Arabic editorial typography. Vertical 9:16, photorealistic 8k commercial studio photography.";

type StageMood = "haircare-botanical" | "luxury-perfume" | "skincare-spa" | "default" | "neutral-industrial";

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function detectStageMood(context: NanoBananaArtDirection): StageMood {
  const haystack = [context.brand, context.industry, context.category, context.name, ...(context.benefits ?? [])]
    .map((v) => normalizeText(v))
    .join(" ");

  const haircare = ["hair", "haircare", "shampoo", "conditioner", "oil", "kids", "child", "baby", "vatika", "penduline", "mink", "شعر", "زيت", "زيوت", "شامبو", "بلسم", "أطفال", "اطفال"];
  const perfume = ["perfume", "oud", "oudh", "luxury", "fragrance", "assaf", "farida", "khamriya", "عطر", "عطور", "عود", "خمريا", "فريدة", "عساف"];
  const skincare = ["skin", "skincare", "moistur", "cream", "lotion", "serum", "aloe", "alo-eva", "eva", "بشرة", "كريم", "مرطب", "ترطيب", "ألو", "الو"];

  const industrial = ["industrial","auto","automotive","engine","mechanic","tool","electronic","hardware","machinery","ميكانيك","سيارات","الكترونيات","صناعي","معدات"];
  if (industrial.some((k) => haystack.includes(k))) return "neutral-industrial";
  if (context.industry && !/(perfume|fragrance|beauty|cosmetic|skincare|haircare|skin|عطر|تجميل|عناية|بشرة|شعر)/i.test(context.industry)) return "neutral-industrial";
  if (haircare.some((k) => haystack.includes(k))) return "haircare-botanical";
  if (perfume.some((k) => haystack.includes(k))) return "luxury-perfume";
  if (skincare.some((k) => haystack.includes(k))) return "skincare-spa";
  return "neutral-industrial";
}

function templateDescription(template: TemplateId): string {
  switch (template) {
    case "simple-botanical-horizon":
      return "Smooth monochrome sage-green studio wall meeting a glossy reflective glass horizon floor in the lower third, two small soft white volumetric clouds floating in the upper sky, fresh green mint and botanical leaves clustered along the horizon, subtle white and silver mesh highlights, bright airy editorial daylight.";
    case "botanical-arch-frame":
      return "Warm sunlit limestone and travertine wall with a soft botanical arch frame, golden-hour light casting delicate palm and monstera leaf shadows, creamy sage and beige tones, airy editorial depth, subtle brushed-silver accents.";
    case "editorial-beauty-card":
      return "Fresh spa editorial backdrop with pale aqua and pearl-white seamless gradient, dewy caustics and soft silver specular highlights, crisp natural daylight, clean minimal pharmacy-beauty mood.";
    case "silver-podium-botanical":
    default:
      return "Premium clinical beauty backdrop with pearl-white and soft silver architectural wall, frosted-glass glow, gentle emerald rim light, subtle metallic mesh texture, bright even studio lighting.";
  }
}

function moodModifier(mood: StageMood): string {
  switch (mood) {
    case "neutral-industrial":
      return "Clean neutral professional studio mood, no beauty or cosmetics styling.";
    case "haircare-botanical":
      return "Warm botanical haircare mood with argan and shea leaf accents.";
    case "luxury-perfume":
      return "Sophisticated Arabian luxury fragrance mood with smoky amber and brushed-brass light.";
    case "skincare-spa":
      return "Hydration and spa freshness mood with dewy droplets and aloe leaves.";
    case "default":
    default:
      return "Clean premium beauty editorial mood.";
  }
}

/**
 * Builds the background-only prompt. Exported so tests can pin the contract
 * (no product / no packaging / vertical 9:16) without calling the model.
 */
export function buildBackgroundPrompt(
  context: NanoBananaArtDirection = {},
  template: TemplateId = "simple-botanical-horizon",
): string {
  return [templateDescription(template), moodModifier(detectStageMood(context)), BACKGROUND_ONLY_SUFFIX]
    .filter(Boolean)
    .join(" ");
}

function extractInlineImage(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const obj = result as Record<string, unknown>;
  const candidates = Array.isArray(obj.candidates) ? obj.candidates : [];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const content = (candidate as Record<string, unknown>).content;
    if (!content || typeof content !== "object") continue;
    const parts = Array.isArray((content as Record<string, unknown>).parts)
      ? ((content as Record<string, unknown>).parts as unknown[])
      : [];
    for (const part of parts) {
      if (!part || typeof part !== "object") continue;
      const p = part as Record<string, unknown>;
      const inline = (p.inlineData ?? p.inline_data) as Record<string, unknown> | undefined;
      if (inline && typeof inline === "object") {
        const data = typeof inline.data === "string" ? inline.data.trim() : "";
        const mime = typeof inline.mimeType === "string" ? inline.mimeType : typeof inline.mime_type === "string" ? inline.mime_type : "image/png";
        if (data) return data.startsWith("data:") ? data : `data:${mime};base64,${data}`;
      }
    }
  }
  return null;
}

function asEmbeddedDataUri(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (v.startsWith("data:image/")) return v;
  // Ensure a real embedded data URI for PNG-safe export when model returns raw base64.
  return `data:image/png;base64,${v}`;
}

function shouldRetryWithFallbackModel(status: number, bodyText: string): boolean {
  if (status === 404) return true;
  const text = bodyText.toLowerCase();
  return (
    status === 400 &&
    (text.includes("not found") ||
      text.includes("unsupported") ||
      text.includes("not supported") ||
      text.includes("unknown model") ||
      text.includes("is not available") ||
      text.includes("model"))
  );
}

/**
 * Text-to-image only: the Gemini request never carries an image of the product.
 */
async function callGeminiImageModel(
  key: string,
  model: string,
  prompt: string,
): Promise<string | null> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ["IMAGE"],
    },
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    const retryable = shouldRetryWithFallbackModel(res.status, errText);
    const error = new Error(`Gemini model ${model} failed with ${res.status}`) as Error & { retryable?: boolean };
    error.retryable = retryable;
    throw error;
  }

  const json = await res.json();
  const extracted = extractInlineImage(json);
  return extracted ? asEmbeddedDataUri(extracted) : null;
}

/**
 * Generates one background-only plate. Returns `studio-fallback` with a null
 * image when Gemini is not configured or unavailable, so callers can fall back
 * to the FLUX/deterministic studio pipeline. The authentic packshot is never
 * passed in or modified.
 */
export async function generateBackgroundWithNanoBananaDetailed(
  env: NanoBananaEnv,
  template: TemplateId,
  context: NanoBananaArtDirection = {},
): Promise<{ image: string | null; provider: NanoBananaStageProvider; model?: string }> {
  const key = env.GEMINI_API_KEY?.trim();
  if (!key) {
    return { image: null, provider: "studio-fallback" };
  }

  const prompt = buildBackgroundPrompt(context, template);

  try {
    const image = await callGeminiImageModel(key, MODEL_PRIMARY, prompt);
    if (image) return { image, provider: "nano-banana", model: MODEL_PRIMARY };
    console.warn(`Nano Banana ${MODEL_PRIMARY} returned no inline background image, falling back to studio pipeline.`);
    return { image: null, provider: "studio-fallback" };
  } catch (error) {
    const retryable = Boolean((error as { retryable?: boolean } | null)?.retryable);
    if (retryable) {
      console.warn(`Nano Banana ${MODEL_PRIMARY} unavailable, retrying with ${MODEL_FALLBACK}.`, error);
      try {
        const image = await callGeminiImageModel(key, MODEL_FALLBACK, prompt);
        if (image) return { image, provider: "nano-banana", model: MODEL_FALLBACK };
        console.warn(`Nano Banana ${MODEL_FALLBACK} returned no inline background image, falling back to studio pipeline.`);
      } catch (fallbackError) {
        console.error(`Nano Banana ${MODEL_FALLBACK} failed, falling back to studio pipeline.`, fallbackError);
      }
    } else {
      console.error("Nano Banana background staging failed, falling back.", error);
    }
  }

  return { image: null, provider: "studio-fallback" };
}

export async function generateBackgroundWithNanoBanana(
  env: NanoBananaEnv,
  template: TemplateId,
  context: NanoBananaArtDirection = {},
): Promise<string | null> {
  const result = await generateBackgroundWithNanoBananaDetailed(env, template, context);
  return result.image;
}

export const onRequestPost: PagesFunction<NanoBananaEnv> = async ({ request, env }) => {
  let payload: unknown = {};
  try {
    const text = await request.text();
    payload = text ? JSON.parse(text) : {};
  } catch {
    return Response.json(
      { success: false, error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const body = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  if (body.imageUrl || body.productImageUrl) {
    return Response.json(
      {
        success: false,
        error:
          "Background-only endpoint: do not send a product image. Use /api/ai/product-composite for reference-conditioned compositing; this endpoint only paints a clean plate.",
      },
      { status: 400 },
    );
  }

  const template = (typeof body.template === "string" ? body.template : "simple-botanical-horizon") as TemplateId;
  const context: NanoBananaArtDirection = {
    brand: typeof body.brand === "string" ? body.brand : null,
    category: typeof body.category === "string" ? body.category : null,
    name: typeof body.name === "string" ? body.name : null,
    benefits: Array.isArray(body.benefits)
      ? body.benefits.filter((item): item is string => typeof item === "string")
      : null,
  };

  const staged = await generateBackgroundWithNanoBananaDetailed(env, template, context);
  if (!staged.image) {
    return Response.json(
      {
        success: false,
        error: "Nano Banana background staging unavailable; fallback to existing studio pipeline.",
        fallback: true,
        stageProvider: staged.provider,
      },
      { status: 502 },
    );
  }

  return Response.json({
    success: true,
    provider: "google-gemini-nano-banana",
    model: staged.model ?? MODEL_PRIMARY,
    stageProvider: staged.provider,
    template,
    image: staged.image,
    kind: "background-only-data-uri",
    containsProduct: false,
  });
};
