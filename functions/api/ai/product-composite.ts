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
const MODEL_WORKERS_IMG2IMG = "@cf/stabilityai/stable-diffusion-xl-base-1.0";
const MODEL_WORKERS_IMG2IMG_LEGACY = "@cf/runwayml/stable-diffusion-v1-5-img2img";
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

const COMPOSITE_SCENE_BY_STYLE: Record<ArtDirectionStyleId, string> = {
  "simple-botanical-horizon":
    "bright white and pale silver studio, a subtle silver mesh backdrop, a glossy reflective floor in the lower third, fresh green mint and botanical leaves curling around the base, soft volumetric white mist",
  "sunlit-travertine":
    "warm sunlit travertine and limestone studio, golden-hour light, soft palm and monstera leaf shadows, brushed brass and cream tones, gentle dust motes in the air",
  "aqua-splash-minimal":
    "pale aqua and pearl-white spa studio, fresh water caustics and suspended droplets, dewy mint leaves, crisp clean daylight reflections",
  "luxury-amber-noir":
    "dark smoked stone architectural studio, dramatic amber rim light, drifting volumetric smoke, deep noir shadows and warm gold reflections",
  "botanical-terracotta":
    "warm sand-beige plaster studio, terracotta surface, diffused daylight with eucalyptus leaf shadows, natural linen and clay textures",
  "modern-clinical-glow":
    "pearl-white and soft silver clinical studio, frosted glass glow, gentle emerald rim light, polished metal surface with clean reflections",
};

function contextHaystack(context?: ProductCompositeContext): string {
  return [context?.brand, context?.category, context?.name, ...(context?.benefits ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function categoryMood(context?: ProductCompositeContext): string {
  const haystack = contextHaystack(context);
  if (/(perfume|fragrance|oud|عود|عطر|برفان|بارفان|luxury|فخم)/.test(haystack)) {
    return "Sophisticated Arabian luxury fragrance campaign mood with rich amber depth.";
  }
  if (/(hair|shampoo|conditioner|oil|زيت|شعر|شامبو|بلسم|أطفال|اطفال)/.test(haystack)) {
    return "Fresh clean botanical haircare campaign mood with natural ingredient energy.";
  }
  if (/(skin|cream|moistur|بشرة|كريم|مرطب|ترطيب|aloe|ألو)/.test(haystack)) {
    return "Fresh hydrated skincare campaign mood with clean spa freshness.";
  }
  return "Premium Egyptian beauty retail campaign mood.";
}

/**
 * Atmosphere is style-locked so a bright studio never drifts into dark smoke
 * and the noir style never loses its smoke.
 */
function atmosphereForStyle(styleId: ArtDirectionStyleId): string {
  return styleId === "luxury-amber-noir"
    ? "drifting volumetric smoke catching the amber light"
    : "soft white studio mist and a faint haze catching the light";
}

/**
 * Builds the reference-conditioned compositing prompt. Exported so tests can
 * pin the policy contract (preserve the label, 9:16 guide, real shadows and
 * reflections) without calling a model.
 */
export function buildProductCompositePrompt(
  input: ProductCompositePromptInput = {},
): string {
  const width = input.width ?? 1080;
  const height = input.height ?? 1920;
  const styleId = input.styleId ?? "simple-botanical-horizon";
  const scene = COMPOSITE_SCENE_BY_STYLE[styleId] ?? COMPOSITE_SCENE_BY_STYLE["simple-botanical-horizon"];

  return [
    "Reference-conditioned commercial product compositing (image-to-image relighting and outpainting), not a flat sticker paste.",
    "The attached image is the ONLY authentic reference for the product packaging. Insert that exact product into the scene below.",
    "Preserve the product exactly: the brand name, every Arabic and Latin letter of the label, the logo, the packaging colours, material, cap and proportions must stay identical to the reference. Copy the label typography pixel-for-pixel: never redraw, reletter, translate, replace, crop or invent any packaging element. Keep every printed letter razor sharp and fully legible.",
    `Scene: ${scene}. ${categoryMood(input.context)}`,
    "Palette lock: the backdrop must stay bright neutral white (#FFFFFF) with only a pale silver mesh texture — absolutely no warm, beige, cream, brown, orange or grey colour cast, and no dark background. Gold appears only as a thin rim highlight on the package edges, never as a backdrop tint.",
    `Lighting and physics: cinematic studio lighting, soft white key light, a subtle pale-gold rim light tracing the package edges, a real 3D perspective contact shadow on the surface, a glossy mirror reflection directly beneath the product, ${atmosphereForStyle(styleId)}, and botanical leaves wrapping around the base with believable depth of field.`,
    `Composition guide (${width}x${height}, vertical 9:16): place the product upright, centred and fully visible, occupying about 62% of the frame height, roughly x=20%..80% and y=18%..68%. Keep the top 18% clean for Arabic headline typography and the bottom 22% clean and uncluttered for a contact bar.`,
    "Do not add any new text or typography: no headline, no price, no discount, no watermark, no logo overlay. The only text in the image must be the authentic label already printed on the product.",
    "One single product only, no duplicates, no extra bottles or jars, no floating cut-out edges, no platform edge, photorealistic 8k commercial advertising photography.",
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

async function generateWithGemini(
  env: ProductCompositeEnv,
  reference: ReferenceImage,
  prompt: string,
  diagnostics: string[],
): Promise<{ image: string; model: string } | null> {
  const key = env.GEMINI_API_KEY?.trim();
  if (!key) return null;

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
        diagnostics.push(`gemini ${model}: HTTP ${response.status}`);
        console.warn(`Gemini image edit ${model} returned HTTP ${response.status}.`);
        continue;
      }

      const image = extractGeminiInlineImage(await response.json());
      if (image) return { image, model };
      diagnostics.push(`gemini ${model}: no inline image`);
    } catch (error) {
      diagnostics.push(`gemini ${model}: ${errorMessage(error)}`);
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
): Promise<{ image: string; model: string } | null> {
  const token = env.HF_TOKEN?.trim();
  if (!token) return null;

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
          diagnostics.push(`huggingface ${model}: HTTP ${response.status}`);
          console.warn(
            `Hugging Face ${model} returned HTTP ${response.status} at ${endpoint}.`,
          );
          if (response.status === 404) continue;
          break;
        }

        const image = await responseToImage(response);
        if (image) return { image, model };
        diagnostics.push(`huggingface ${model}: no image in response`);
        break;
      } catch (error) {
        diagnostics.push(`huggingface ${model}: ${errorMessage(error)}`);
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
): Promise<{ image: string; model: string } | null> {
  if (!env.AI || typeof env.AI.run !== "function") return null;

  // 1. FLUX.2 [klein]: real reference-conditioned editing. The authentic
  //    packshot is the binary `input_image_0` reference and the model paints a
  //    new 9:16 scene around the genuine package (4 fixed steps, ~9s).
  //
  //    The safety classifier occasionally flags a benign studio output; that is
  //    nondeterministic, so a single retry is attempted before giving up.
  const extension =
    reference.mime === "image/png"
      ? "png"
      : reference.mime === "image/webp"
        ? "webp"
        : reference.mime === "image/avif"
          ? "avif"
          : "jpg";

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const form = new FormData();
      form.append("prompt", prompt);
      form.append(
        "input_image_0",
        new Blob([Uint8Array.from(reference.bytes)], { type: reference.mime }),
        `authentic-packshot.${extension}`,
      );
      form.append("width", "768");
      form.append("height", "1344");
      form.append("guidance", "5");
      const serialized = new Response(form);

      const result = await env.AI.run(MODEL_WORKERS_EDIT, {
        multipart: {
          body: serialized.body,
          contentType:
            serialized.headers.get("content-type") ?? "multipart/form-data",
        },
      });
      const image = await extractImageFromUnknown(result);
      if (image) return { image, model: MODEL_WORKERS_EDIT };
      diagnostics.push(`workers-ai ${MODEL_WORKERS_EDIT}: no image in response`);
    } catch (error) {
      diagnostics.push(
        `workers-ai ${MODEL_WORKERS_EDIT} attempt ${attempt}: ${errorMessage(error)}`,
      );
      console.warn(
        `Workers AI ${MODEL_WORKERS_EDIT} reference editing attempt ${attempt} failed.`,
        error,
      );
    }
  }

  const negativePrompt =
    "blurry label, distorted text, misspelled letters, extra bottles, duplicate product, watermark, price tag, low quality, deformed packaging";

  // 2. SDXL Base 1.0 legacy img2img path (image_b64 + strength). It must stay
  //    light to fit the request budget; the retired Runway endpoint is last.
  const attempts: { model: string; input: Record<string, unknown> }[] = [
    {
      model: MODEL_WORKERS_IMG2IMG,
      input: {
        prompt,
        negative_prompt: negativePrompt,
        image_b64: reference.base64,
        strength: 0.6,
        guidance: 6.5,
        num_steps: 6,
        width: 512,
        height: 896,
      },
    },
    {
      model: MODEL_WORKERS_IMG2IMG_LEGACY,
      input: {
        prompt,
        negative_prompt: negativePrompt,
        image: Array.from(reference.bytes),
        strength: 0.5,
        guidance: 7,
        num_steps: 6,
        width: 512,
        height: 896,
      },
    },
  ];

  for (const attempt of attempts) {
    try {
      const result = await env.AI.run(attempt.model, attempt.input);
      const image = await extractImageFromUnknown(result);
      if (image) return { image, model: attempt.model };
      diagnostics.push(`workers-ai ${attempt.model}: no image in response`);
    } catch (error) {
      diagnostics.push(`workers-ai ${attempt.model}: ${errorMessage(error)}`);
      console.warn(
        `Workers AI ${attempt.model} image-to-image compositing failed.`,
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
    };
  }

  const prompt = buildProductCompositePrompt({
    styleId: options.styleId,
    context,
    width: options.width,
    height: options.height,
  });
  const diagnostics: string[] = [];

  const gemini = await generateWithGemini(env, reference, prompt, diagnostics);
  if (gemini) {
    return {
      image: gemini.image,
      provider: "gemini-image-edit",
      model: gemini.model,
      usedReference: true,
      containsProduct: true,
      aiComposite: true,
    };
  }

  const workersAi = await generateWithWorkersAi(
    env,
    reference,
    prompt,
    diagnostics,
  );
  if (workersAi) {
    return {
      image: workersAi.image,
      provider: "workers-ai-img2img",
      model: workersAi.model,
      usedReference: true,
      containsProduct: true,
      aiComposite: true,
    };
  }

  const huggingFace = await generateWithHuggingFace(
    env,
    reference,
    prompt,
    diagnostics,
  );
  if (huggingFace) {
    return {
      image: huggingFace.image,
      provider: "huggingface-img2img",
      model: huggingFace.model,
      usedReference: true,
      containsProduct: true,
      aiComposite: true,
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

function isStyleId(value: unknown): value is ArtDirectionStyleId {
  return typeof value === "string" && value in COMPOSITE_SCENE_BY_STYLE;
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
      },
      502,
    );
  }

  return noStoreJson({
    success: true,
    provider: outcome.provider,
    model: outcome.model,
    styleId: styleId ?? "simple-botanical-horizon",
    image: outcome.image,
    kind: "reference-conditioned-data-uri",
    usedReference: outcome.usedReference,
    containsProduct: outcome.containsProduct,
    aiComposite: outcome.aiComposite,
  });
};
