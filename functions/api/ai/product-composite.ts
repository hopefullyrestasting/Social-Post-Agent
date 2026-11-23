/**
 * POST /api/ai/product-composite
 *
 * Reference-conditioned product compositing (image-to-image relighting and
 * outpainting) for the 1080x1920 WhatsApp Status ad.
 *
 * AUTHORIZED POLICY (AGENTS.md rule #4): the authentic packshot may be passed
 * to an image model **as a reference/conditioning input** so the model can
 * paint real 3D perspective shadows, surface reflections, volumetric mist and
 * botanicals that interact with the product. The model is always instructed to
 * preserve the brand name, label typography and package geometry exactly. It is
 * never allowed to invent or restyle the packaging, and the authentic source
 * image URL is kept in D1 for provenance.
 *
 * Providers, in order:
 *   1. Google Gemini image editing (`GEMINI_API_KEY`) — best label fidelity.
 *   2. Cloudflare Workers AI zero-key fallback:
 *      `@cf/black-forest-labs/flux-2-klein-4b` reference editing (primary),
 *      then `@cf/stabilityai/stable-diffusion-xl-base-1.0` img2img, then the
 *      retired `@cf/runwayml/stable-diffusion-v1-5-img2img` last resort.
 *   3. Hugging Face Inference API (`HF_TOKEN`, e.g. lllyasviel/ic-light).
 *
 * When no provider is configured/unavailable the function returns
 * `provider: "unavailable"` with `image: null` so the campaign runner can fall
 * back to the background-only plate + authentic SVG packshot composite.
 */

import { validateRemoteImageUrl } from "./remove-bg";
import {
  detectBase64ImageMime,
  type ArtDirectionStyleId,
} from "./studio-scene";

interface AiBinding {
  run: (model: string, input: Record<string, unknown>) => Promise<unknown>;
}

export interface ProductCompositeEnv {
  AI?: AiBinding;
  GEMINI_API_KEY?: string;
  HF_TOKEN?: string;
  /** Optional override for the Hugging Face image-to-image model. */
  HF_COMPOSITE_MODEL?: string;
}

export interface ProductCompositeContext {
  brand?: string | null;
  category?: string | null;
  name?: string | null;
  benefits?: string[] | null;
}

export type ProductCompositeProvider =
  | "gemini-image-edit"
  | "huggingface-img2img"
  | "workers-ai-img2img"
  | "unavailable";

export interface CompositeAttempt {
  provider: string;
  model: string;
  status: "success" | "failed" | "skipped";
  errorCode?: string;
}

export interface ProductCompositeOutcome {
  image: string | null;
  provider: ProductCompositeProvider;
  model?: string;
  /** True only when the authentic packshot was actually sent to the model. */
  usedReference: boolean;
  /** The generated image contains the product (safe to skip the SVG packshot). */
  containsProduct: boolean;
  aiComposite: boolean;
  fallbackReason?: string;
  /** Bounded, secret-free provider error summaries for operations/debugging. */
  diagnostics?: string[];
  /** Explicit per-provider attempt telemetry (never silent fallbacks). */
  attempts?: CompositeAttempt[];
}

export interface ProductCompositePromptInput {
  styleId?: ArtDirectionStyleId;
  context?: ProductCompositeContext;
  width?: number;
  height?: number;
}

const MODEL_GEMINI_PRIMARY = "gemini-2.5-flash-image";
const MODEL_GEMINI_FALLBACK = "gemini-2.0-flash-exp-image-generation";
/**
 * FLUX.2 [klein] unifies text-to-image and image editing on Workers AI with a
 * fixed 4-step pass. It takes the authentic packshot as a binary reference
 * (`input_image_0`) and returns a 9:16 edit in ~9s, which fits the Pages
 * function budget. This is the primary zero-key compositor.
 */
const MODEL_WORKERS_EDIT = "@cf/black-forest-labs/flux-2-klein-4b";
const MODEL_WORKERS_EDIT_LARGE = "@cf/black-forest-labs/flux-2-klein-9b";
const DEFAULT_HF_MODELS = [
  "lllyasviel/ic-light",
  "black-forest-labs/FLUX.1-dev",
];

const MAX_REFERENCE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/avif",
]);

/**
 * Master art-direction environments (outdoor/editorial luxury). The authentic
 * packshot is relit and placed naturally onto a real tactile surface — never on
 * a fake podium and never against a flat studio backdrop.
 */
interface EditorialEnvironment {
  surfaceMaterial: string;
  environmentalBackdrop: string;
}

const MARINE_FRESH_ENV: EditorialEnvironment = {
  surfaceMaterial: "sunlit rough coastal sandstone rock",
  environmentalBackdrop:
    "deep blue Mediterranean sea waves in the distance with soft white sea spray in the air under a clear warm sky",
};

const OUD_WARM_ENV: EditorialEnvironment = {
  surfaceMaterial: "dark textured basalt stone slab",
  environmentalBackdrop:
    "warm golden-amber sunset haze and a subtle atmospheric glow",
};

const BOTANICAL_ENV: EditorialEnvironment = {
  surfaceMaterial:
    "sun-dappled wet travertine stone with fresh mint and botanical leaves and morning dew droplets",
  environmentalBackdrop:
    "lush sunlit botanical garden bokeh with warm natural sunbeams",
};

// Style-driven environments for the four approved luxury art directions.
// Each template enforces clean top-35% and bottom-15% safe zones for SVG typography overlay.
const STYLE_ENVIRONMENT_HINT: Partial<Record<ArtDirectionStyleId, EditorialEnvironment>> = {
  "coastal-sunlit-stone-caustics": {
    surfaceMaterial: "sun-drenched rough coastal sandstone/limestone ledge",
    environmentalBackdrop:
      "deep blue Mediterranean sea and airy sky with soft sea spray atmosphere in warm golden-hour light",
  },
  "botanical-horizon-reflection": {
    surfaceMaterial:
      "glossy mirror floor in front of a color-matched monochrome sage/pastel studio wall, with fresh mint and botanical leaves clustered at the base and soft floating clouds above",
    environmentalBackdrop:
      "airy sunlit garden bokeh with gentle sunbeams and a clean, bright horizon reflection",
  },
  "noir-basalt-golden-rim": {
    surfaceMaterial: "dark architectural basalt stone slab",
    environmentalBackdrop:
      "warm golden-amber rim light, subtle atmospheric mist and a cinematic noir-to-amber glow",
  },
  "architectural-brand-frame": {
    surfaceMaterial: "polished brand-navy stone slab with thin gold corner brackets",
    environmentalBackdrop:
      "soft warm ambient glow with subtle industry-watermark icons in the distance and a dark illuminated podium pedestal",
  },
};

function contextHaystack(context?: ProductCompositeContext): string {
  return [context?.brand, context?.category, context?.name, ...(context?.benefits ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function resolveEditorialEnvironment(
  context?: ProductCompositeContext,
  styleId?: ArtDirectionStyleId,
): EditorialEnvironment {
  // Prefer the explicitly selected rotating art style so variants stay distinct.
  if (styleId && STYLE_ENVIRONMENT_HINT[styleId]) {
    return STYLE_ENVIRONMENT_HINT[styleId] as EditorialEnvironment;
  }

  const haystack = contextHaystack(context);

  // Marine / Fresh perfumes (e.g. Assaf Wild Colt, blue/fresh scents).
  if (
    /(wild colt|marine|fresh|aquatic|ocean|sea|blue|بحر|بحري|منعش|فريش|أزرق|ازرق)/.test(
      haystack,
    )
  ) {
    return MARINE_FRESH_ENV;
  }

  // Oud / Warm / Oriental perfumes (e.g. Dior Sauvage, Khamriya).
  if (
    /(oud|oriental|warm|amber|noir|smoke|incense|tobacco|spice|sauvage|khamriya|عود|شرقي|دافئ|عنبر|خمريا)/.test(
      haystack,
    ) ||
    /(perfume|fragrance|عطر|برفان|بارفان)/.test(haystack)
  ) {
    return OUD_WARM_ENV;
  }

  // Skincare / Moisturizers / Botanicals (default commercial category).
  if (
    /(skin|cream|moistur|lotion|serum|shampoo|conditioner|hair|mask|aloe|botanical|بشرة|كريم|مرطب|شعر|شامبو|بلسم|ماسك|عناية|صابون|غسول)/.test(
      haystack,
    )
  ) {
    return BOTANICAL_ENV;
  }

  return BOTANICAL_ENV;
}

/**
 * Builds the reference-conditioned compositing prompt. Exported so tests can
 * pin the policy contract (preserve the label, 9:16 guide, real shadows and
 * caustic light) without calling a model.
 */
export function buildProductCompositePrompt(
  input: ProductCompositePromptInput = {},
): string {
  const styleId = input.styleId ?? "coastal-sunlit-stone-caustics";
  const env = resolveEditorialEnvironment(input.context, styleId);
  const name = (input.context?.name || "").trim() || "product";
  const brand = (input.context?.brand || "").trim();
  const productName = [brand, name].filter(Boolean).join(" ");

  // Enforce strict zero-text constraints in safe zones for SVG overlay compatibility.
  // Top 35%: completely free of any visual noise — no letters, no numbers, no Arabic script, no watermarks.
  // Bottom 15%: completely free of any visual noise — no letters, no numbers, no watermarks.
  // The model must preserve the authentic packshot label 100% but never generate new text.
  // Prompt intentionally avoids the words "Arabic", "text", "words", "letters", "numbers", "typography"
  // to prevent FLUX from rendering garbled sky/foreground artifacts.
  const zeroTextZone =
    "UPPER 35%: clean, open, and softly lit, and COMPLETELY FREE OF ANY VISUAL NOISE — NO LETTERS, NO NUMBERS, NO ARABIC SCRIPT, NO WATERMARKS for SVG typography overlay. NO generated text, NO price tags, NO discount badges, NO captions in the sky zone. BOTTOM 15%: COMPLETELY FREE OF ANY VISUAL NOISE — NO LETTERS, NO NUMBERS, NO WATERMARKS for contact text, and the bottom 12% reads naturally darker for the contact lockup. NO generated text, NO floating words. The authentic packshot label is preserved pixel-for-pixel from the reference; all other text must be rendered by the SVG overlay.";

  return [
    `Commercial luxury product photography of the exact ${productName} bottle from the reference image standing upright on a natural ${env.surfaceMaterial} ledge, bathed in crisp natural golden-hour sunlight.`,
    "Realistic directional shadows and colored glass light refraction (caustics) cast across the textured surface.",
    `Background features ${env.environmentalBackdrop} rendered in creamy cinematic shallow depth of field (85mm f/1.8 lens).`,
    zeroTextZone,
    "Strictly preserve the exact bottle shape, cap, glass color, colors, and original label text and logos from the reference image 100% authentic and undistorted. Copy every Arabic and Latin letter pixel-for-pixel: never redraw, reletter, translate, replace, crop or invent any packaging element; keep all printed text razor sharp and fully legible. DO NOT generate or restyle any text outside the reference image.",
    "No generated text, no watermarks, no extra bottles, no fake podium, no flat studio backdrop. One single authentic product only, photorealistic 8k commercial advertising photography.",
  ].join(" ");
}

/**
 * Compact, safety-friendlier variant used as a retry when the full prompt is
 * flagged. Keeps the same environment, 9:16 safe areas and preservation rules.
 */
function buildCompactCompositePrompt(
  input: ProductCompositePromptInput = {},
): string {
  const styleId = input.styleId ?? "coastal-sunlit-stone-caustics";
  const env = resolveEditorialEnvironment(input.context, styleId);
  return [
    "Edit the reference photo into a photorealistic 9:16 luxury product advertisement.",
    `Place the exact same product from the image upright on ${env.surfaceMaterial} in natural golden-hour sunlight with realistic directional shadows and light caustics, and ${env.environmentalBackdrop} in soft bokeh (85mm f/1.8).`,
    "UPPER 35%: clean, open, and softly lit, and COMPLETELY FREE OF ANY VISUAL NOISE — NO LETTERS, NO NUMBERS, NO ARABIC SCRIPT, NO WATERMARKS for SVG typography overlay. BOTTOM 15%: COMPLETELY FREE OF ANY VISUAL NOISE — NO LETTERS, NO NUMBERS, NO WATERMARKS for contact text, and the bottom 12% reads naturally darker. NO generated text, NO floating words. The authentic packshot label is preserved pixel-for-pixel from the reference; all other text must be rendered by the SVG overlay.",
    "Preserve the bottle shape, cap, colors and every letter of the original label and logo exactly as in the reference image, fully legible and undistorted.",
    "No generated text, no watermark, no extra products, no podium. One authentic product only.",
  ].join(" ");
}

interface ReferenceImage {
  base64: string;
  mime: string;
  dataUri: string;
  bytes: Uint8Array;
}

function base64FromBytes(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function bytesFromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function parseDataImageUri(value: string): ReferenceImage | null {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(value.trim());
  if (!match) return null;
  const mime = match[1].toLowerCase().replace("image/jpg", "image/jpeg");
  if (!ALLOWED_MIMES.has(mime)) return null;
  const base64 = match[2].replace(/\s+/g, "");
  if (!base64) return null;
  let bytes: Uint8Array;
  try {
    bytes = bytesFromBase64(base64);
  } catch {
    return null;
  }
  if (bytes.length === 0 || bytes.length > MAX_REFERENCE_BYTES) return null;
  return { base64, mime, dataUri: `data:${mime};base64,${base64}`, bytes };
}

/**
 * Resolves the authentic packshot into base64 bytes for image-to-image
 * conditioning. Data URIs are parsed locally; http(s) URLs are validated
 * against private/local hosts before fetching (SSRF guard shared with the
 * background-removal pipeline).
 */
export async function loadReferenceImage(
  imageUrl: string,
): Promise<ReferenceImage | null> {
  const clean = imageUrl?.trim();
  if (!clean) return null;

  if (clean.startsWith("data:")) return parseDataImageUri(clean);

  const validation = validateRemoteImageUrl(clean);
  if (!validation.ok) return null;

  try {
    const response = await fetch(validation.url.toString(), {
      method: "GET",
      redirect: "follow",
      headers: {
        Accept: "image/png,image/jpeg,image/webp,image/avif,image/*;q=0.8,*/*;q=0.5",
        "User-Agent": "AlRahma-ProductComposite/1.0",
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) return null;

    const finalUrl = new URL(response.url || validation.url.toString());
    const finalCheck = validateRemoteImageUrl(finalUrl.toString());
    if (!finalCheck.ok) return null;

    const contentType = (response.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    const mime = contentType === "image/jpg" ? "image/jpeg" : contentType;
    if (!ALLOWED_MIMES.has(mime)) return null;

    const lengthHeader = Number(response.headers.get("content-length") ?? "");
    if (Number.isFinite(lengthHeader) && lengthHeader > MAX_REFERENCE_BYTES) return null;

    const buffer = await response.arrayBuffer();
    if (!buffer || buffer.byteLength === 0 || buffer.byteLength > MAX_REFERENCE_BYTES) {
      return null;
    }
    const bytes = new Uint8Array(buffer);
    const base64 = base64FromBytes(bytes);
    return { base64, mime, dataUri: `data:${mime};base64,${base64}`, bytes };
  } catch {
    return null;
  }
}

function asDataImageUri(base64: string): string {
  const clean = base64.trim();
  if (clean.startsWith("data:image/")) return clean;
  return `data:${detectBase64ImageMime(clean)};base64,${clean}`;
}

async function bytesFromUnknown(value: unknown): Promise<Uint8Array | null> {
  if (!value) return null;
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (Array.isArray(value) && value.every((item) => typeof item === "number")) {
    return Uint8Array.from(value);
  }
  if (
    typeof (value as { arrayBuffer?: unknown }).arrayBuffer === "function"
  ) {
    try {
      const buffer = await (
        value as { arrayBuffer: () => Promise<ArrayBuffer> }
      ).arrayBuffer();
      if (buffer) return new Uint8Array(buffer);
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
        if (!chunk) continue;
        const bytes =
          chunk instanceof Uint8Array
            ? chunk
            : new Uint8Array(chunk as ArrayBuffer);
        chunks.push(bytes);
        total += bytes.length;
      }
      const merged = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      return merged;
    } catch {
      // ignore
    }
  }
  return null;
}

async function extractImageFromUnknown(
  value: unknown,
  depth = 0,
): Promise<string | null> {
  if (value === null || value === undefined || depth > 4) return null;
  if (typeof value === "string") {
    const clean = value.trim();
    if (!clean) return null;
    if (clean.startsWith("data:image/")) return clean;
    if (clean.length > 64 && /^[A-Za-z0-9+/=\r\n]+$/.test(clean)) {
      return asDataImageUri(clean);
    }
    return null;
  }

  const bytes = await bytesFromUnknown(value);
  if (bytes && bytes.length > 0) {
    const base64 = base64FromBytes(bytes);
    return asDataImageUri(base64);
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of [
      "image",
      "generated_image",
      "data",
      "output",
      "result",
      "images",
      "artifacts",
    ]) {
      if (!(key in obj)) continue;
      const candidate = obj[key];
      if (Array.isArray(candidate)) {
        for (const item of candidate) {
          const image = await extractImageFromUnknown(item, depth + 1);
          if (image) return image;
        }
        continue;
      }
      const image = await extractImageFromUnknown(candidate, depth + 1);
      if (image) return image;
    }
  }
  return null;
}

function extractGeminiInlineImage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const candidates = (payload as { candidates?: unknown[] }).candidates ?? [];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const content = (candidate as { content?: unknown }).content;
    if (!content || typeof content !== "object") continue;
    const parts = (content as { parts?: unknown[] }).parts ?? [];
    for (const part of parts) {
      if (!part || typeof part !== "object") continue;
      const inline = (part as Record<string, unknown>).inlineData ??
        (part as Record<string, unknown>).inline_data;
      if (!inline || typeof inline !== "object") continue;
      const inlineObj = inline as Record<string, unknown>;
      const data = typeof inlineObj.data === "string" ? inlineObj.data.trim() : "";
      if (!data) continue;
      if (data.startsWith("data:")) return data;
      const mime =
        (typeof inlineObj.mimeType === "string" && inlineObj.mimeType) ||
        (typeof inlineObj.mime_type === "string" && inlineObj.mime_type) ||
        detectBase64ImageMime(data);
      return `data:${mime};base64,${data}`;
    }
  }
  return null;
}

function errorMessage(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : (() => {
            try {
              return JSON.stringify(error);
            } catch {
              return String(error);
            }
          })();
  return raw.slice(0, 300);
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

function pushAttempt(
  attempts: CompositeAttempt[],
  diagnostics: string[],
  attempt: CompositeAttempt,
  detail?: string,
): void {
  attempts.push(attempt);
  if (detail) diagnostics.push(detail);
}

async function generateWithGemini(
  env: ProductCompositeEnv,
  reference: ReferenceImage,
  prompt: string,
  diagnostics: string[],
  attempts: CompositeAttempt[],
): Promise<{ image: string; model: string } | null> {
  const key = env.GEMINI_API_KEY?.trim();
  if (!key) {
    pushAttempt(attempts, diagnostics, {
      provider: "gemini-image-edit",
      model: MODEL_GEMINI_PRIMARY,
      status: "skipped",
      errorCode: "not_configured",
    });
    return null;
  }

  for (const model of [MODEL_GEMINI_PRIMARY, MODEL_GEMINI_FALLBACK]) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
      key,
    )}`;
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { inlineData: { mimeType: reference.mime, data: reference.base64 } },
                { text: prompt },
              ],
            },
          ],
          generationConfig: { responseModalities: ["IMAGE"] },
        }),
        signal: AbortSignal.timeout(60_000),
      });

      if (!response.ok) {
        const code = `HTTP ${response.status}`;
        pushAttempt(attempts, diagnostics, {
          provider: "gemini-image-edit",
          model,
          status: "failed",
          errorCode: code,
        }, `gemini ${model}: ${code}`);
        console.warn(`Gemini image edit ${model} returned HTTP ${response.status}.`);
        continue;
      }

      const image = extractGeminiInlineImage(await response.json());
      if (image) {
        pushAttempt(attempts, diagnostics, {
          provider: "gemini-image-edit",
          model,
          status: "success",
        });
        return { image, model };
      }
      pushAttempt(attempts, diagnostics, {
        provider: "gemini-image-edit",
        model,
        status: "failed",
        errorCode: "no_image",
      }, `gemini ${model}: no inline image`);
    } catch (error) {
      const msg = errorMessage(error);
      pushAttempt(attempts, diagnostics, {
        provider: "gemini-image-edit",
        model,
        status: "failed",
        errorCode: msg,
      }, `gemini ${model}: ${msg}`);
      console.warn(`Gemini image edit ${model} failed.`, error);
    }
  }

  return null;
}

function hfModelPath(model: string): string {
  return model
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function hfModelEndpoints(model: string): string[] {
  const path = hfModelPath(model);
  return [
    `https://router.huggingface.co/hf-inference/models/${path}`,
    `https://api-inference.huggingface.co/models/${path}`,
  ];
}

async function responseToImage(response: Response): Promise<string | null> {
  const contentType = (response.headers.get("content-type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();

  if (contentType.startsWith("image/")) {
    const buffer = await response.arrayBuffer();
    if (!buffer || buffer.byteLength === 0) return null;
    return `data:${contentType};base64,${base64FromBytes(new Uint8Array(buffer))}`;
  }

  try {
    return await extractImageFromUnknown(await response.json());
  } catch {
    return null;
  }
}

async function generateWithHuggingFace(
  env: ProductCompositeEnv,
  reference: ReferenceImage,
  prompt: string,
  diagnostics: string[],
  attempts: CompositeAttempt[],
): Promise<{ image: string; model: string } | null> {
  const token = env.HF_TOKEN?.trim();
  if (!token) {
    pushAttempt(attempts, diagnostics, {
      provider: "huggingface-img2img",
      model: env.HF_COMPOSITE_MODEL?.trim() || DEFAULT_HF_MODELS[0],
      status: "skipped",
      errorCode: "not_configured",
    });
    return null;
  }

  const models = Array.from(
    new Set(
      [env.HF_COMPOSITE_MODEL?.trim(), ...DEFAULT_HF_MODELS].filter(
        (model): model is string => Boolean(model),
      ),
    ),
  );

  const parameters: Record<string, unknown> = {
    prompt,
    negative_prompt:
      "blurry label, distorted text, misspelled letters, extra bottles, duplicate product, watermark, price tag, discount badge, low quality, deformed packaging",
    guidance_scale: 5.5,
    num_inference_steps: 28,
    strength: 0.55,
  };

  for (const model of models) {
    for (const endpoint of hfModelEndpoints(model)) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "image/png,image/jpeg,application/json",
          },
          body: JSON.stringify({
            inputs: reference.dataUri,
            parameters: { ...parameters, width: 1080, height: 1920 },
          }),
          signal: AbortSignal.timeout(90_000),
        });

        if (!response.ok) {
          const code = `HTTP ${response.status}`;
          pushAttempt(attempts, diagnostics, {
            provider: "huggingface-img2img",
            model,
            status: "failed",
            errorCode: code,
          }, `huggingface ${model}: ${code}`);
          console.warn(
            `Hugging Face ${model} returned HTTP ${response.status} at ${endpoint}.`,
          );
          if (response.status === 404) continue;
          break;
        }

        const image = await responseToImage(response);
        if (image) {
          pushAttempt(attempts, diagnostics, {
            provider: "huggingface-img2img",
            model,
            status: "success",
          });
          return { image, model };
        }
        pushAttempt(attempts, diagnostics, {
          provider: "huggingface-img2img",
          model,
          status: "failed",
          errorCode: "no_image",
        }, `huggingface ${model}: no image in response`);
        break;
      } catch (error) {
        const msg = errorMessage(error);
        pushAttempt(attempts, diagnostics, {
          provider: "huggingface-img2img",
          model,
          status: "failed",
          errorCode: msg,
        }, `huggingface ${model}: ${msg}`);
        console.warn(`Hugging Face ${model} failed at ${endpoint}.`, error);
      }
    }
  }

  return null;
}

async function generateWithWorkersAi(
  env: ProductCompositeEnv,
  reference: ReferenceImage,
  prompt: string,
  diagnostics: string[],
  attempts: CompositeAttempt[],
  options: { styleId?: ArtDirectionStyleId; context?: ProductCompositeContext } = {},
): Promise<{ image: string; model: string } | null> {
  if (!env.AI || typeof env.AI.run !== "function") {
    pushAttempt(attempts, diagnostics, {
      provider: "workers-ai-img2img",
      model: MODEL_WORKERS_EDIT,
      status: "skipped",
      errorCode: "not_configured",
    });
    return null;
  }

  // FLUX.2 [klein]: true reference-conditioned editing. The authentic packshot
  // is the binary `input_image_0` reference and the model paints a new 9:16
  // scene around the genuine package (4 fixed steps, ~9s).
  //
  // The output safety classifier can flag a benign result nondeterministically
  // or be sensitive to a long prompt, so we retry with a compact prompt and, if
  // needed, the larger 9B model before falling back.
  const extension =
    reference.mime === "image/png"
      ? "png"
      : reference.mime === "image/webp"
        ? "webp"
        : reference.mime === "image/avif"
          ? "avif"
          : "jpg";

  const compactPrompt = buildCompactCompositePrompt({
    styleId: options.styleId,
    context: options.context,
  });

  const editAttempts: { model: string; editPrompt: string; label: string }[] = [
    { model: MODEL_WORKERS_EDIT, editPrompt: prompt, label: "attempt 1" },
    { model: MODEL_WORKERS_EDIT, editPrompt: compactPrompt, label: "attempt 2 (compact)" },
    { model: MODEL_WORKERS_EDIT_LARGE, editPrompt: compactPrompt, label: "attempt 3 (9b)" },
  ];

  for (const attempt of editAttempts) {
    try {
      const form = new FormData();
      form.append("prompt", attempt.editPrompt);
      form.append(
        "input_image_0",
        new Blob([Uint8Array.from(reference.bytes)], { type: reference.mime }),
        `authentic-packshot.${extension}`,
      );
      form.append("width", "768");
      form.append("height", "1344");
      form.append("guidance", "5");
      const serialized = new Response(form);

      const result = await withTimeout(
        env.AI.run(attempt.model, {
          multipart: {
            body: serialized.body,
            contentType:
              serialized.headers.get("content-type") ?? "multipart/form-data",
          },
        }),
        55_000,
      );
      const image = await extractImageFromUnknown(result);
      if (image) {
        pushAttempt(attempts, diagnostics, {
          provider: "workers-ai-img2img",
          model: attempt.model,
          status: "success",
        });
        return { image, model: attempt.model };
      }
      pushAttempt(attempts, diagnostics, {
        provider: "workers-ai-img2img",
        model: attempt.model,
        status: "failed",
        errorCode: "no_image",
      }, `workers-ai ${attempt.model}: no image in response`);
    } catch (error) {
      const msg = errorMessage(error);
      pushAttempt(attempts, diagnostics, {
        provider: "workers-ai-img2img",
        model: attempt.model,
        status: "failed",
        errorCode: msg,
      }, `workers-ai ${attempt.model} ${attempt.label}: ${msg}`);
      console.warn(
        `Workers AI ${attempt.model} reference editing ${attempt.label} failed.`,
        error,
      );
    }
  }

  return null;
}

/**
 * Composites the authentic packshot into a 9:16 studio scene with a
 * reference-conditioned image model. Returns `unavailable` (never throws) so the
 * campaign runner can always fall back to the deterministic background plate +
 * authentic SVG packshot.
 */
export async function compositeProductScene(
  env: ProductCompositeEnv,
  productImageUrl: string,
  context: ProductCompositeContext = {},
  options: { styleId?: ArtDirectionStyleId; width?: number; height?: number } = {},
): Promise<ProductCompositeOutcome> {
  const hasProvider = Boolean(
    env.GEMINI_API_KEY?.trim() || env.HF_TOKEN?.trim() || env.AI,
  );
  if (!hasProvider) {
    return {
      image: null,
      provider: "unavailable",
      usedReference: false,
      containsProduct: false,
      aiComposite: false,
      fallbackReason:
        "No image-to-image provider configured (GEMINI_API_KEY, HF_TOKEN or Workers AI); using the authentic packshot composite fallback.",
      diagnostics: [],
      attempts: [],
    };
  }

  const reference = await loadReferenceImage(productImageUrl);
  if (!reference) {
    return {
      image: null,
      provider: "unavailable",
      usedReference: false,
      containsProduct: false,
      aiComposite: false,
      fallbackReason:
        "Authentic reference packshot could not be read; using the authentic packshot composite fallback.",
      diagnostics: ["reference packshot could not be loaded"],
      attempts: [],
    };
  }

  const prompt = buildProductCompositePrompt({
    styleId: options.styleId,
    context,
    width: options.width,
    height: options.height,
  });
  const diagnostics: string[] = [];
  const attempts: CompositeAttempt[] = [];

  const gemini = await generateWithGemini(env, reference, prompt, diagnostics, attempts);
  if (gemini) {
    return {
      image: gemini.image,
      provider: "gemini-image-edit",
      model: gemini.model,
      usedReference: true,
      containsProduct: true,
      aiComposite: true,
      diagnostics,
      attempts,
    };
  }

  const workersAi = await generateWithWorkersAi(
    env,
    reference,
    prompt,
    diagnostics,
    attempts,
    { styleId: options.styleId, context },
  );
  if (workersAi) {
    return {
      image: workersAi.image,
      provider: "workers-ai-img2img",
      model: workersAi.model,
      usedReference: true,
      containsProduct: true,
      aiComposite: true,
      diagnostics,
      attempts,
    };
  }

  const huggingFace = await generateWithHuggingFace(
    env,
    reference,
    prompt,
    diagnostics,
    attempts,
  );
  if (huggingFace) {
    return {
      image: huggingFace.image,
      provider: "huggingface-img2img",
      model: huggingFace.model,
      usedReference: true,
      containsProduct: true,
      aiComposite: true,
      diagnostics,
      attempts,
    };
  }

  return {
    image: null,
    provider: "unavailable",
    usedReference: false,
    containsProduct: false,
    aiComposite: false,
    fallbackReason:
      "Configured image-to-image providers did not return an image; using the authentic packshot composite fallback.",
    diagnostics,
    attempts,
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

const KNOWN_STYLE_IDS: ReadonlySet<string> = new Set([
  "coastal-sunlit-stone-caustics",
  "botanical-horizon-reflection",
  "noir-basalt-golden-rim",
]);

function isStyleId(value: unknown): value is ArtDirectionStyleId {
  return typeof value === "string" && KNOWN_STYLE_IDS.has(value);
}

export const onRequestPost: PagesFunction<ProductCompositeEnv> = async ({
  request,
  env,
}) => {
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
  const imageUrl =
    typeof body.imageUrl === "string"
      ? body.imageUrl
      : typeof body.productImageUrl === "string"
        ? body.productImageUrl
        : "";

  if (!imageUrl.trim()) {
    return noStoreJson(
      {
        success: false,
        error:
          "imageUrl (the authentic product cutout) is required for reference-conditioned compositing.",
      },
      400,
    );
  }

  const rawContext = (body.context && typeof body.context === "object"
    ? body.context
    : {}) as Record<string, unknown>;
  const context: ProductCompositeContext = {
    brand: typeof rawContext.brand === "string" ? rawContext.brand : null,
    category: typeof rawContext.category === "string" ? rawContext.category : null,
    name: typeof rawContext.name === "string" ? rawContext.name : null,
    benefits: Array.isArray(rawContext.benefits)
      ? rawContext.benefits.filter(
          (item): item is string => typeof item === "string",
        )
      : null,
  };

  const styleId = isStyleId(body.styleId) ? body.styleId : undefined;
  const outcome = await compositeProductScene(env, imageUrl, context, {
    styleId,
  });

  if (!outcome.image) {
    return noStoreJson(
      {
        success: false,
        error: "Product compositing unavailable; fall back to the background plate + authentic packshot overlay.",
        fallback: true,
        provider: outcome.provider,
        usedReference: outcome.usedReference,
        fallbackReason: outcome.fallbackReason,
        diagnostics: outcome.diagnostics,
        attempts: outcome.attempts,
      },
      502,
    );
  }

  return noStoreJson({
    success: true,
    provider: outcome.provider,
    model: outcome.model,
    styleId: styleId ?? "coastal-sunlit-stone-caustics",
    image: outcome.image,
    kind: "reference-conditioned-data-uri",
    usedReference: outcome.usedReference,
    containsProduct: outcome.containsProduct,
    aiComposite: outcome.aiComposite,
    attempts: outcome.attempts,
  });
};
