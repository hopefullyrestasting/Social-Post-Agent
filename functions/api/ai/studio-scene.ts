/**
 * POST/GET /api/ai/studio-scene
 *
 * Generates a photorealistic 9:16 studio background (no text, no bottles/products,
 * pure stage/podium/lighting scene) for ad composition.
 *
 * Primary: Cloudflare Workers AI binding (env.AI) with FLUX.1 Schnell — free and
 *   reliable on the Pages/Workers free tier.
 * Secondary: Google Gemini Flash Image when `GEMINI_API_KEY` is bound and its
 *   free quota allows.
 * Fallback: deterministic inline vector studio stage (PNG-export safe).
 *
 * Every successful scene is returned as an embedded `data:image/...;base64,...`
 * URI so the final SVG never depends on an external image URL when exported to
 * PNG in the browser.
 */

interface AiBinding {
  run: (model: string, input: Record<string, unknown>) => Promise<unknown>;
}

export interface SceneEnv {
  AI?: AiBinding;
  GEMINI_API_KEY?: string;
}

type TemplateId = "silver-podium-botanical" | "botanical-arch-frame" | "editorial-beauty-card";

export type ArtDirectionStyleId =
  | "sunlit-travertine"
  | "aqua-splash-minimal"
  | "luxury-amber-noir"
  | "botanical-terracotta"
  | "modern-clinical-glow";

export type SceneProvider = "cloudflare-ai" | "gemini-flash-image" | "deterministic-studio";

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
  /** Bundled deterministic template used when both AI providers fail. */
  template: TemplateId;
  /** Full background-only commercial photography prompt. */
  scenePrompt: string;
  /** Short accent colour hint used by the dashboard badges. */
  accent: string;
}

/**
 * Five distinct commercial art directions. Each prompt describes ONLY the stage
 * (no product, no packaging, no text) with clean top/bottom negative space so
 * the authentic packshot and Arabic editorial typography can be composited on
 * top without fighting busy areas.
 */
export const ART_DIRECTION_STYLES: Record<ArtDirectionStyleId, ArtDirectionStyle> = {
  "sunlit-travertine": {
    id: "sunlit-travertine",
    labelAr: "شمس الترافرتين",
    labelEn: "Sunlit Travertine",
    template: "botanical-arch-frame",
    accent: "#C9A06A",
    scenePrompt:
      "Photorealistic commercial beauty product advertising studio stage, warm sunlit textured travertine stone plinth centered in the lower third, golden-hour sunlight through a window casting crisp palm and monstera leaf shadows on a creamy sage plaster wall, natural argan and dried botanical accents at the edges, warm cream and sage depth, 85mm macro lens look, shallow depth of field, soft realistic contact shadow on the empty plinth top, generous clean uncluttered negative space in the top 25% and bottom 28% for Arabic typography, no product, no bottle, no packaging, no text, no letters, no logos, no watermark, vertical 9:16",
  },
  "aqua-splash-minimal": {
    id: "aqua-splash-minimal",
    labelAr: "ماء وأكريليك",
    labelEn: "Aqua Splash Minimal",
    template: "editorial-beauty-card",
    accent: "#67C7D8",
    scenePrompt:
      "Photorealistic fresh spa commercial beauty studio stage, sculpted white acrylic pedestal centered in the lower third, crystal-clear water ripples and a subtle splash crown, dewy condensation droplets on a pale aqua seamless backdrop, fresh mint and aloe leaves at the lower corners, crisp natural daylight with soft caustic reflections, clean empty plinth top, generous clean uncluttered negative space in the top 25% and bottom 28% for Arabic typography, no product, no bottle, no packaging, no text, no letters, no logos, no watermark, vertical 9:16",
  },
  "luxury-amber-noir": {
    id: "luxury-amber-noir",
    labelAr: "فخامة العنبر الداكن",
    labelEn: "Luxury Amber Noir",
    template: "editorial-beauty-card",
    accent: "#B8860B",
    scenePrompt:
      "Photorealistic moody luxury perfume advertising studio stage, dark smoked-travertine and brushed brass pedestal centered in the lower third, warm amber rim lighting and dramatic architectural shadows, subtle agarwood chips and dark floral mist accents at the edges, rich noir background with a soft golden glow, elegant empty display surface with realistic contact shadow, generous clean uncluttered negative space in the top 25% and bottom 28% for Arabic typography, no product, no bottle, no packaging, no text, no letters, no logos, no watermark, vertical 9:16",
  },
  "botanical-terracotta": {
    id: "botanical-terracotta",
    labelAr: "نباتات وتيراكوتا",
    labelEn: "Botanical Terracotta",
    template: "botanical-arch-frame",
    accent: "#C97B5A",
    scenePrompt:
      "Photorealistic warm botanical editorial beauty studio stage, soft warm clay and natural linen textured pedestal centered in the lower third, eucalyptus branches and dried botanicals arranged at the edges, diffused natural daylight with gentle window shadows on a sand-beige plaster wall, earthy terracotta and cream palette, empty display surface with a realistic soft contact shadow, generous clean uncluttered negative space in the top 25% and bottom 28% for Arabic typography, no product, no bottle, no packaging, no text, no letters, no logos, no watermark, vertical 9:16",
  },
  "modern-clinical-glow": {
    id: "modern-clinical-glow",
    labelAr: "صيدلية عصرية",
    labelEn: "Modern Clinical Glow",
    template: "silver-podium-botanical",
    accent: "#3FBF9A",
    scenePrompt:
      "Photorealistic high-end pharmacy skincare studio stage, frosted glass podium centered in the lower third, soft emerald and pearl rim lighting, clean minimal pale grey-white architectural backdrop with subtle silver mesh texture, polished empty display surface with a crisp realistic contact shadow, premium clinical beauty aesthetic, generous clean uncluttered negative space in the top 25% and bottom 28% for Arabic typography, no product, no bottle, no packaging, no text, no letters, no logos, no watermark, vertical 9:16",
  },
};

export const ART_DIRECTION_STYLE_IDS: ArtDirectionStyleId[] = [
  "sunlit-travertine",
  "aqua-splash-minimal",
  "luxury-amber-noir",
  "botanical-terracotta",
  "modern-clinical-glow",
];

export const LEGACY_SCENE_PROMPTS: Record<TemplateId, string> = {
  "silver-podium-botanical": ART_DIRECTION_STYLES["modern-clinical-glow"].scenePrompt,
  "botanical-arch-frame": ART_DIRECTION_STYLES["sunlit-travertine"].scenePrompt,
  "editorial-beauty-card": ART_DIRECTION_STYLES["aqua-splash-minimal"].scenePrompt,
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

/** Detect the real mime type of a base64 payload (PNG/JPEG/WebP) instead of guessing. */
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
    case "botanical-arch-frame":
      return "sunlit-travertine";
    case "editorial-beauty-card":
      return "aqua-splash-minimal";
    case "silver-podium-botanical":
    default:
      return "modern-clinical-glow";
  }
}

function isArtDirectionStyleId(value: unknown): value is ArtDirectionStyleId {
  return (
    typeof value === "string" &&
    (ART_DIRECTION_STYLE_IDS as string[]).includes(value)
  );
}

function isTemplateId(value: unknown): value is TemplateId {
  return typeof value === "string" && value in LEGACY_SCENE_PROMPTS;
}

function hashSeed(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

/** Deterministically rotate the five art directions so every product looks fresh. */
export function styleForSeed(seed: string, offset = 0): ArtDirectionStyleId {
  const index = (hashSeed(seed) + offset) % ART_DIRECTION_STYLE_IDS.length;
  return ART_DIRECTION_STYLE_IDS[index];
}

/**
 * Two distinct styles for the two variants of one product. Guarantees variant 2
 * never reuses variant 1's scene, which was the root of the "same look" loop.
 */
export function variantStylePair(seed: string): [ArtDirectionStyleId, ArtDirectionStyleId] {
  const first = styleForSeed(seed, 0);
  let second = styleForSeed(seed, 1);
  if (second === first) {
    const index = ART_DIRECTION_STYLE_IDS.indexOf(first);
    second = ART_DIRECTION_STYLE_IDS[(index + 1) % ART_DIRECTION_STYLE_IDS.length];
  }
  return [first, second];
}

function categoryMood(context?: ArtDirectionContext): string {
  const haystack = [
    context?.brand,
    context?.category,
    context?.name,
    ...(context?.benefits ?? []),
  ]
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

export function buildScenePrompt(
  styleId: ArtDirectionStyleId,
  context?: ArtDirectionContext,
): string {
  const style = ART_DIRECTION_STYLES[styleId] ?? ART_DIRECTION_STYLES["modern-clinical-glow"];
  return `${style.scenePrompt}. ${categoryMood(context)}`;
}

async function bytesFromUnknown(value: unknown): Promise<Uint8Array | null> {
  if (!value) return null;
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (Array.isArray(value) && value.every((n) => typeof n === "number")) {
    return Uint8Array.from(value);
  }
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
      if (key in obj) {
        if (typeof obj[key] === "string") {
          // A plain base64 string: let the caller wrap it as a data URI.
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
  }
  return null;
}

function decodeBase64Marker(bytes: Uint8Array): string | null {
  if (bytes.length < 11) return null;
  // ASCII "__base64__:" prefix used to ferry base64 strings through bytesFromUnknown.
  const prefix = "__base64__:";
  const head = String.fromCharCode(...bytes.subarray(0, prefix.length));
  if (head !== prefix) return null;
  return new TextDecoder().decode(bytes.subarray(prefix.length));
}

async function generateWithFlux(
  env: SceneEnv,
  prompt: string,
  seed?: number,
): Promise<string | null> {
  if (!env.AI || typeof env.AI.run !== "function") return null;

  try {
    const input: Record<string, unknown> = { prompt, num_steps: 6 };
    if (seed !== undefined) input.seed = seed;
    const result = await env.AI.run(MODEL_FLUX, input);

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
      const mime = base64FromBytes(bytes).startsWith("iVBORw0KGgo")
        ? "image/png"
        : "image/jpeg";
      return `data:${mime};base64,${base64FromBytes(bytes)}`;
    }
  } catch (error) {
    console.error("Workers AI FLUX studio-scene generation failed.", error);
  }

  return null;
}

async function callGeminiImageModel(
  key: string,
  model: string,
  prompt: string,
): Promise<string | null> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
    key,
  )}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE"] },
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!response.ok) {
    throw Object.assign(
      new Error(`Gemini ${model} returned HTTP ${response.status}`),
      { status: response.status, retryable: response.status === 404 || response.status === 400 },
    );
  }

  const payload = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: { mimeType?: string; data?: string };
          inline_data?: { mime_type?: string; data?: string };
        }>;
      };
    }>;
  };

  for (const candidate of payload.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      const inline = (part.inlineData ?? part.inline_data) as
        | { data?: string; mimeType?: string; mime_type?: string }
        | undefined;
      if (!inline?.data) continue;
      const mime =
        inline.mimeType ??
        inline.mime_type ??
        detectBase64ImageMime(inline.data);
      return `data:${mime};base64,${inline.data}`;
    }
  }

  return null;
}

async function generateWithGemini(
  env: SceneEnv,
  prompt: string,
): Promise<{ image: string; model: string } | null> {
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

/**
 * Reusable server-side scene generator: FLUX (Workers AI) first, Gemini Flash
 * Image second, deterministic vector studio fallback (returns null) last.
 */
export async function generateArtDirectedScene(
  env: SceneEnv,
  styleId: ArtDirectionStyleId,
  context?: ArtDirectionContext,
  options?: { seed?: number; promptOverride?: string },
): Promise<GeneratedArtDirectedScene> {
  const style = ART_DIRECTION_STYLES[styleId] ?? ART_DIRECTION_STYLES["modern-clinical-glow"];
  const prompt = options?.promptOverride?.trim() || buildScenePrompt(style.id, context);

  const flux = await generateWithFlux(env, prompt, options?.seed);
  if (flux) {
    return {
      image: flux,
      provider: "cloudflare-ai",
      styleId: style.id,
      styleLabelAr: style.labelAr,
      styleLabelEn: style.labelEn,
      template: style.template,
      model: MODEL_FLUX,
    };
  }

  const gemini = await generateWithGemini(env, prompt);
  if (gemini) {
    return {
      image: gemini.image,
      provider: "gemini-flash-image",
      styleId: style.id,
      styleLabelAr: style.labelAr,
      styleLabelEn: style.labelEn,
      template: style.template,
      model: gemini.model,
    };
  }

  return {
    image: null,
    provider: "deterministic-studio",
    styleId: style.id,
    styleLabelAr: style.labelAr,
    styleLabelEn: style.labelEn,
    template: style.template,
    fallbackReason:
      !env.AI && !env.GEMINI_API_KEY
        ? "No AI binding/key configured; using PNG-safe inline vector studio stage."
        : "AI scene providers unavailable; using PNG-safe inline vector studio stage.",
  };
}

function noStoreJson(payload: unknown, status = 200): Response {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0, must-revalidate",
    },
  });
}

function parseSceneRequest(
  body: Record<string, unknown>,
): {
  styleId: ArtDirectionStyleId;
  template: TemplateId;
  promptOverride?: string;
  seed?: number;
  context: ArtDirectionContext;
} {
  const styleId = isArtDirectionStyleId(body.style)
    ? body.style
    : isTemplateId(body.template)
      ? styleFromTemplate(body.template)
      : styleFromSeed(typeof body.seed === "string" ? body.seed : "al-rahma", 0);

  const template = isTemplateId(body.template)
    ? body.template
    : ART_DIRECTION_STYLES[styleId].template;
  const promptOverride = typeof body.prompt === "string" ? body.prompt : undefined;
  const seed = clampSeed(body.seed);
  const rawContext = (body.context && typeof body.context === "object"
    ? body.context
    : {}) as Record<string, unknown>;
  const context: ArtDirectionContext = {
    brand: typeof rawContext.brand === "string" ? rawContext.brand : null,
    category: typeof rawContext.category === "string" ? rawContext.category : null,
    name: typeof rawContext.name === "string" ? rawContext.name : null,
    benefits: Array.isArray(rawContext.benefits)
      ? rawContext.benefits.filter((item): item is string => typeof item === "string")
      : null,
  };

  return { styleId, template, promptOverride, seed, context };
}

function styleFromSeed(seed: string, offset: number): ArtDirectionStyleId {
  return styleForSeed(seed, offset);
}

export const onRequestPost: PagesFunction<SceneEnv> = async ({ request, env }) => {
  let payload: unknown = {};
  try {
    const text = await request.text();
    payload = text ? JSON.parse(text) : {};
  } catch {
    return noStoreJson(
      { success: false, error: "Request body must be valid JSON." },
      400,
    );
  }

  const body = (payload && typeof payload === "object" ? payload : {}) as Record<
    string,
    unknown
  >;
  const { styleId, seed, promptOverride, context } = parseSceneRequest(body);

  const scene = await generateArtDirectedScene(env, styleId, context, {
    seed,
    promptOverride,
  });

  if (scene.image) {
    return noStoreJson({
      success: true,
      provider: scene.provider,
      styleId: scene.styleId,
      styleLabelAr: scene.styleLabelAr,
      styleLabelEn: scene.styleLabelEn,
      template: scene.template,
      model: scene.model,
      image: scene.image,
      kind: "data-uri",
    });
  }

  return noStoreJson({
    success: true,
    provider: "bundled-studio-stage",
    requestedProvider: "cloudflare-ai",
    styleId: scene.styleId,
    styleLabelAr: scene.styleLabelAr,
    styleLabelEn: scene.styleLabelEn,
    template: scene.template,
    // Deliberately no external /studio-scenes URL: the overlay renders the
    // inline deterministic vector stage so PNG export is always self-contained.
    image: null,
    kind: "inline-vector",
    fallback: scene.fallbackReason,
  });
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
      : styleForSeed(seedParam ?? "al-rahma", 0);
  const scene = await generateArtDirectedScene(env, styleId, undefined, {
    seed: seedParam ? clampSeed(Number(seedParam)) : undefined,
    promptOverride,
  });

  if (scene.image) {
    return noStoreJson({
      success: true,
      provider: scene.provider,
      styleId: scene.styleId,
      styleLabelAr: scene.styleLabelAr,
      styleLabelEn: scene.styleLabelEn,
      template: scene.template,
      model: scene.model,
      image: scene.image,
      kind: "data-uri",
    });
  }

  return noStoreJson({
    success: true,
    provider: "bundled-studio-stage",
    requestedProvider: "cloudflare-ai",
    styleId: scene.styleId,
    styleLabelAr: scene.styleLabelAr,
    styleLabelEn: scene.styleLabelEn,
    template: scene.template,
    image: null,
    kind: "inline-vector",
    fallback: scene.fallbackReason,
  });
};
