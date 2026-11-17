import {
  type DesignerTemplate,
  deterministicSceneMarkup,
  resolveSimplePaletteKey,
  type SimplePaletteKey,
} from "../../../src/lib/al-rahma/background-provider";

/**
 * POST/GET /api/ai/studio-scene
 *
 * Generates a photorealistic 9:16 studio background (no text, no bottles/products,
 * pure scene) for ad composition.
 *
 * Primary: Cloudflare Workers AI FLUX.1 Schnell (fast, free-tier friendly).
 * Secondary: Google Gemini Flash Image when GEMINI_API_KEY is configured.
 * Fallback: deterministic inline vector studio stage (PNG-export safe, embedded).
 */

interface AiBinding {
  run: (model: string, input: Record<string, unknown>) => Promise<unknown>;
}

export interface SceneEnv {
  AI?: AiBinding;
  GEMINI_API_KEY?: string;
}

export type TemplateId = DesignerTemplate;

export type ArtDirectionStyleId =
  | "coastal-sunlit-stone-caustics"
  | "botanical-horizon-reflection"
  | "noir-basalt-golden-rim";

export type SceneProvider =
  | "cloudflare-ai"
  | "gemini-flash-image"
  | "deterministic-studio";

export interface ArtDirectionContext {
  brand?: string | null;
  category?: string | null;
  name?: string | null;
  benefits?: string[] | null;
}

export interface ArtDirectionStyle {
  id: ArtDirectionStyleId;
  labelAr: string;
  labelEn: string;
  template: TemplateId;
  scenePrompt: string;
  accent: string;
}

export const ART_DIRECTION_STYLES: Record<ArtDirectionStyleId, ArtDirectionStyle> = {
  "coastal-sunlit-stone-caustics": {
    id: "coastal-sunlit-stone-caustics",
    labelAr: "حجر ساحلي مشمس وانكسارات ضوئية",
    labelEn: "Coastal Sunlit Stone & Caustics",
    template: "botanical-arch-frame",
    accent: "#D4A574",
    scenePrompt:
      "Photorealistic 9:16 outdoor editorial luxury product backdrop, sun-drenched rough coastal sandstone/limestone ledge, crisp natural golden-hour sunlight casting realistic directional shadows, colored glass light refraction and caustic highlights dancing across the warm stone texture, deep blue Mediterranean sea and airy sky in creamy cinematic shallow depth of field bokeh (85mm f/1.8), sea spray atmosphere, warm honey and sand tones. Keep the upper 35% clean, open and softly lit for bold Arabic headline typography and the bottom 12% naturally darker/grounded for contact text. No podium, no plinth, no pedestal, no stage, no table, no shelf, no product, no bottle, no packaging, no text, no letters, no logos, no watermark.",
  },
  "botanical-horizon-reflection": {
    id: "botanical-horizon-reflection",
    labelAr: "أفق نباتي بانعكاس",
    labelEn: "Botanical Horizon Reflection",
    template: "simple-botanical-horizon",
    accent: "#6BAA59",
    scenePrompt:
      "Photorealistic 9:16 luxury beauty studio backdrop, color-matched monochrome sage/pastel wall meeting a glossy mirror floor that creates a clean horizon reflection, fresh mint and botanical leaves clustered low at the base around the center placement area, a few soft floating clouds in the open upper air, diffused natural daylight with gentle sunbeams and airy garden bokeh. Keep the upper 35% clean and open for bold Arabic headline typography and the bottom 12% slightly darker/grounded for contact text. No podium, no plinth, no pedestal, no stage, no table, no shelf, no product, no bottle, no packaging, no text, no letters, no logos, no watermark.",
  },
  "noir-basalt-golden-rim": {
    id: "noir-basalt-golden-rim",
    labelAr: "بازلت داكن وإضاءة ذهبية محيطية",
    labelEn: "Noir Basalt & Golden Rim-Light",
    template: "editorial-beauty-card",
    accent: "#D97706",
    scenePrompt:
      "Photorealistic 9:16 moody luxury editorial backdrop, dark architectural basalt stone slab and textured charcoal wall, warm golden-amber rim light grazing the edges with elegant directional highlights, subtle atmospheric mist/glow and cinematic depth, rich noir-to-amber gradient. Keep the upper 35% clean and softly lit for bold Arabic headline typography and the bottom 12% darker for contact text. No podium, no plinth, no pedestal, no stage, no table, no shelf, no product, no bottle, no packaging, no text, no letters, no logos, no watermark.",
  },
};

export const ART_DIRECTION_STYLE_IDS: ArtDirectionStyleId[] = [
  "coastal-sunlit-stone-caustics",
  "botanical-horizon-reflection",
  "noir-basalt-golden-rim",
];

export const DEFAULT_ART_DIRECTION_STYLE: ArtDirectionStyleId =
  "coastal-sunlit-stone-caustics";

export const LEGACY_SCENE_PROMPTS: Record<TemplateId, string> = {
  "simple-botanical-horizon": ART_DIRECTION_STYLES["botanical-horizon-reflection"].scenePrompt,
  "silver-podium-botanical": ART_DIRECTION_STYLES["botanical-horizon-reflection"].scenePrompt,
  "botanical-arch-frame": ART_DIRECTION_STYLES["coastal-sunlit-stone-caustics"].scenePrompt,
  "editorial-beauty-card": ART_DIRECTION_STYLES["noir-basalt-golden-rim"].scenePrompt,
};

const MODEL_FLUX = "@cf/black-forest-labs/flux-1-schnell";
const MODEL_GEMINI_PRIMARY = "gemini-2.5-flash-image";
const MODEL_GEMINI_FALLBACK = "gemini-2.0-flash-exp-image-generation";

function clampSeed(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(2_147_483_647, Math.floor(value)));
}

function base64FromBytes(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function detectBase64ImageMime(
  base64: string,
): "image/png" | "image/jpeg" | "image/webp" {
  const head = base64.trim().slice(0, 32);
  if (head.startsWith("iVBORw0KGgo")) return "image/png";
  if (head.startsWith("UklGR")) return "image/webp";
  if (head.startsWith("/9j/")) return "image/jpeg";
  return "image/jpeg";
}

function asDataImageUri(value: string): string {
  const clean = value.trim();
  if (clean.startsWith("data:image/")) return clean;
  return `data:${detectBase64ImageMime(clean)};base64,${clean}`;
}

function styleFromTemplate(template: TemplateId): ArtDirectionStyleId {
  switch (template) {
    case "simple-botanical-horizon":
      return "botanical-horizon-reflection";
    case "botanical-arch-frame":
      return "coastal-sunlit-stone-caustics";
    case "editorial-beauty-card":
      return "noir-basalt-golden-rim";
    case "silver-podium-botanical":
    default:
      return "botanical-horizon-reflection";
  }
}

function isArtDirectionStyleId(value: unknown): value is ArtDirectionStyleId {
  return typeof value === "string" && (ART_DIRECTION_STYLE_IDS as string[]).includes(value);
}

function isTemplateId(value: unknown): value is TemplateId {
  return (
    typeof value === "string" &&
    ["simple-botanical-horizon", "silver-podium-botanical", "botanical-arch-frame", "editorial-beauty-card"].includes(value)
  );
}

function hashSeed(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

export function styleForSeed(seed: string, offset = 0): ArtDirectionStyleId {
  const index = (hashSeed(seed) + offset) % ART_DIRECTION_STYLE_IDS.length;
  return ART_DIRECTION_STYLE_IDS[index];
}

export function variantStylePair(seed: string): [ArtDirectionStyleId, ArtDirectionStyleId] {
  const first = styleForSeed(seed, 0);
  let second = styleForSeed(seed, 1);
  if (second === first) {
    second = ART_DIRECTION_STYLE_IDS[(ART_DIRECTION_STYLE_IDS.indexOf(first) + 1) % ART_DIRECTION_STYLE_IDS.length];
  }
  return [first, second];
}

function categoryMood(context?: ArtDirectionContext): string {
  const haystack = [context?.brand, context?.category, context?.name, ...(context?.benefits ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/(perfume|fragrance|oud|عود|عطر|برفان|luxury)/.test(haystack)) {
    return "The mood is sophisticated Arabian luxury fragrance editorial.";
  }
  if (/(hair|shampoo|conditioner|oil|زيت|شعر|شامبو|بلسم|أطفال|اطفال)/.test(haystack)) {
    return "The mood is warm botanical haircare editorial with natural ingredients.";
  }
  if (/(skin|cream|moistur|بشرة|كريم|مرطب|ترطيب|aloe|ألو)/.test(haystack)) {
    return "The mood is fresh hydrated skincare editorial with clean spa energy.";
  }
  return "The mood is premium Egyptian beauty retail editorial.";
}

function botanicalHue(context?: ArtDirectionContext): string {
  const palette = resolveSimplePaletteKey(context);
  const hues: Record<SimplePaletteKey, string> = {
    "fresh-sage": "sage-green",
    "blush-apricot": "soft blush-pink",
    "golden-sage": "warm golden sage-green",
    "luxury-emerald": "deep emerald-charcoal",
  };
  return hues[palette] ?? "sage-green";
}

export function buildScenePrompt(styleId: ArtDirectionStyleId, context?: ArtDirectionContext): string {
  const style = ART_DIRECTION_STYLES[styleId] ?? ART_DIRECTION_STYLES[DEFAULT_ART_DIRECTION_STYLE];
  let prompt = style.scenePrompt;
  if (style.id === "botanical-horizon-reflection") {
    prompt = prompt.replace("color-matched monochrome sage/pastel wall", `color-matched monochrome ${botanicalHue(context)} wall`);
  }
  return `${prompt} ${categoryMood(context)}`;
}

async function bytesFromUnknown(value: unknown): Promise<Uint8Array | null> {
  if (!value) return null;
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (Array.isArray(value) && value.every((n) => typeof n === "number")) return Uint8Array.from(value);
  if (typeof (value as { arrayBuffer?: unknown }).arrayBuffer === "function") {
    try {
      const ab = await (value as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer();
      if (ab) return new Uint8Array(ab);
    } catch {
      // ignore
    }
  }
  if (typeof ReadableStream !== "undefined" && value instanceof ReadableStream) {
    try {
      const reader = value.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        if (chunk) {
          const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk as ArrayBuffer);
          chunks.push(bytes);
          total += bytes.length;
        }
      }
      const merged = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) {
        merged.set(c, offset);
        offset += c.length;
      }
      return merged;
    } catch {
      // ignore
    }
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of ["image", "data", "bytes", "result", "body"]) {
      if (!(key in obj)) continue;
      if (typeof obj[key] === "string") {
        const candidate = obj[key] as string;
        if (candidate.length > 64 && /^[A-Za-z0-9+/=\r\n]+$/.test(candidate)) {
          return new TextEncoder().encode(`__base64__:${candidate}`);
        }
        return null;
      }
      const inner = await bytesFromUnknown(obj[key]);
      if (inner) return inner;
    }
  }
  return null;
}

function decodeBase64Marker(bytes: Uint8Array): string | null {
  if (bytes.length < 11) return null;
  const prefix = "__base64__:";
  const head = String.fromCharCode(...bytes.subarray(0, prefix.length));
  if (head !== prefix) return null;
  return new TextDecoder().decode(bytes.subarray(prefix.length));
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timeout_${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function generateWithFlux(env: SceneEnv, prompt: string, seed?: number): Promise<string | null> {
  if (!env.AI || typeof env.AI.run !== "function") return null;
  try {
    const input: Record<string, unknown> = { prompt, num_steps: 6 };
    if (seed !== undefined) input.seed = seed;
    const result = await withTimeout(env.AI.run(MODEL_FLUX, input), 45_000);

    if (typeof result === "string") return asDataImageUri(result);
    if (result && typeof result === "object") {
      const obj = result as Record<string, unknown>;
      if (typeof obj.image === "string") return asDataImageUri(obj.image);
      if (typeof obj.data === "string" && obj.data.length > 64) return asDataImageUri(obj.data);
    }
    const bytes = await bytesFromUnknown(result);
    if (bytes && bytes.length > 0) {
      const base64 = decodeBase64Marker(bytes);
      if (base64) return asDataImageUri(base64);
      const encoded = base64FromBytes(bytes);
      const mime = encoded.startsWith("iVBORw0KGgo") ? "image/png" : "image/jpeg";
      return `data:${mime};base64,${encoded}`;
    }
  } catch (error) {
    console.error("Workers AI FLUX studio-scene generation failed.", error);
  }
  return null;
}

async function callGeminiImageModel(key: string, model: string, prompt: string): Promise<string | null> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE"] },
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`Gemini ${model} returned HTTP ${response.status}`);

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string }; inline_data?: { mime_type?: string; data?: string } }> } }>;
  };
  for (const candidate of payload.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      const inline = (part.inlineData ?? part.inline_data) as { data?: string; mimeType?: string; mime_type?: string } | undefined;
      if (!inline?.data) continue;
      const mime = inline.mimeType ?? inline.mime_type ?? detectBase64ImageMime(inline.data);
      return `data:${mime};base64,${inline.data}`;
    }
  }
  return null;
}

async function generateWithGemini(env: SceneEnv, prompt: string): Promise<{ image: string; model: string } | null> {
  const key = env.GEMINI_API_KEY?.trim();
  if (!key) return null;
  for (const model of [MODEL_GEMINI_PRIMARY, MODEL_GEMINI_FALLBACK]) {
    try {
      const image = await callGeminiImageModel(key, model, prompt);
      if (image) return { image, model };
    } catch (error) {
      console.warn(`Gemini scene generation with ${model} failed.`, error);
    }
  }
  return null;
}

export interface GeneratedArtDirectedScene {
  image: string | null;
  provider: SceneProvider;
  styleId: ArtDirectionStyleId;
  styleLabelAr: string;
  styleLabelEn: string;
  template: TemplateId;
  model?: string;
  fallbackReason?: string;
}

export async function generateArtDirectedScene(
  env: SceneEnv,
  styleId: ArtDirectionStyleId,
  context?: ArtDirectionContext,
  options?: { seed?: number; promptOverride?: string },
): Promise<GeneratedArtDirectedScene> {
  const style = ART_DIRECTION_STYLES[styleId] ?? ART_DIRECTION_STYLES[DEFAULT_ART_DIRECTION_STYLE];
  const prompt = options?.promptOverride?.trim() || buildScenePrompt(style.id, context);

  const flux = await generateWithFlux(env, prompt, options?.seed);
  if (flux) {
    return { image: flux, provider: "cloudflare-ai", styleId: style.id, styleLabelAr: style.labelAr, styleLabelEn: style.labelEn, template: style.template, model: MODEL_FLUX };
  }

  const gemini = await generateWithGemini(env, prompt);
  if (gemini) {
    return { image: gemini.image, provider: "gemini-flash-image", styleId: style.id, styleLabelAr: style.labelAr, styleLabelEn: style.labelEn, template: style.template, model: gemini.model };
  }

  const palette = resolveSimplePaletteKey(context);
  const fallbackImage = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920" width="1080" height="1920">${deterministicSceneMarkup(style.template, 1080, 1920, palette)}</svg>`,
  )}`;

  return {
    image: fallbackImage,
    provider: "deterministic-studio",
    styleId: style.id,
    styleLabelAr: style.labelAr,
    styleLabelEn: style.labelEn,
    template: style.template,
    fallbackReason:
      !env.AI && !env.GEMINI_API_KEY
        ? "No AI binding/key configured; using inline vector studio stage."
        : "AI scene providers unavailable or timed out; using inline vector studio stage.",
  };
}

function noStoreJson(payload: unknown, status = 200): Response {
  return Response.json(payload, { status, headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" } });
}

function parseSceneRequest(body: Record<string, unknown>): {
  styleId: ArtDirectionStyleId; template: TemplateId; promptOverride?: string; seed?: number; context: ArtDirectionContext;
} {
  const styleId = isArtDirectionStyleId(body.style)
    ? body.style
    : isTemplateId(body.template)
      ? styleFromTemplate(body.template)
      : DEFAULT_ART_DIRECTION_STYLE;

  const template = isTemplateId(body.template) ? body.template : ART_DIRECTION_STYLES[styleId].template;
  const promptOverride = typeof body.prompt === "string" ? body.prompt : undefined;
  const seed = clampSeed(body.seed);
  const rawContext = (body.context && typeof body.context === "object" ? body.context : {}) as Record<string, unknown>;
  const context: ArtDirectionContext = {
    brand: typeof rawContext.brand === "string" ? rawContext.brand : null,
    category: typeof rawContext.category === "string" ? rawContext.category : null,
    name: typeof rawContext.name === "string" ? rawContext.name : null,
    benefits: Array.isArray(rawContext.benefits) ? rawContext.benefits.filter((item): item is string => typeof item === "string") : null,
  };
  return { styleId, template, promptOverride, seed, context };
}

export const onRequestPost: PagesFunction<SceneEnv> = async ({ request, env }) => {
  let payload: unknown = {};
  try {
    const text = await request.text();
    payload = text ? JSON.parse(text) : {};
  } catch {
    return noStoreJson({ success: false, error: "Request body must be valid JSON." }, 400);
  }
  const body = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const { styleId, seed, promptOverride, context } = parseSceneRequest(body);
  const scene = await generateArtDirectedScene(env, styleId, context, { seed, promptOverride });
  return noStoreJson({ success: true, provider: scene.provider, styleId: scene.styleId, styleLabelAr: scene.styleLabelAr, styleLabelEn: scene.styleLabelEn, template: scene.template, model: scene.model, image: scene.image, kind: scene.provider === "deterministic-studio" ? "inline-vector" : "data-uri", fallback: scene.fallbackReason });
};

export const onRequestGet: PagesFunction<SceneEnv> = async ({ request, env }) => {
  const url = new URL(request.url);
  const styleParam = url.searchParams.get("style");
  const templateParam = url.searchParams.get("template");
  const seedParam = url.searchParams.get("seed");
  const promptOverride = url.searchParams.get("prompt") || undefined;
  const styleId = isArtDirectionStyleId(styleParam)
    ? styleParam
    : isTemplateId(templateParam)
      ? styleFromTemplate(templateParam)
      : DEFAULT_ART_DIRECTION_STYLE;
  const scene = await generateArtDirectedScene(env, styleId, undefined, { seed: seedParam ? clampSeed(Number(seedParam)) : undefined, promptOverride });
  return noStoreJson({ success: true, provider: scene.provider, styleId: scene.styleId, styleLabelAr: scene.styleLabelAr, styleLabelEn: scene.styleLabelEn, template: scene.template, model: scene.model, image: scene.image, kind: scene.provider === "deterministic-studio" ? "inline-vector" : "data-uri", fallback: scene.fallbackReason });
};
