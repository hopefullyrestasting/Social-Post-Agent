/**
 * POST /api/ai/studio-scene
 *
 * Generates a photorealistic 9:16 studio background (no text, no bottles/products,
 * pure stage/podium/lighting scene) for ad composition.
 *
 * Primary: Cloudflare Workers AI binding (env.AI) with FLUX.1 Schnell.
 * Fallback: Pollinations image URL (no key required).
 *
 * Returns a data URL (base64) when AI is available, or a fetchable image URL.
 */

interface Env {
  AI?: {
    run: (model: string, input: Record<string, unknown>) => Promise<unknown>;
  };
}

type TemplateId = "silver-podium-botanical" | "botanical-arch-frame" | "editorial-beauty-card";

const DEFAULT_TEMPLATE: TemplateId = "silver-podium-botanical";

const PROMPTS: Record<TemplateId, string> = {
  "silver-podium-botanical":
    "Photorealistic luxury cosmetic product photography stage, minimalist 3D white and soft silver hexagonal podium in the lower center, lush green tropical palm leaves framing the bottom corners, soft matte silver spheres floating gently in blurred background, bright clean studio lighting, empty podium top, no bottles, no text, no logos, vertical 9:16",
  "botanical-arch-frame":
    "Minimalist editorial skincare studio background, warm cream and soft sage green architectural arch backdrop, natural sunlight shadows, subtle botanical leaves, clean empty display surface at bottom, photorealistic commercial photography, no products, no text, vertical 9:16",
  "editorial-beauty-card":
    "photorealistic 9:16 editorial beauty studio background, light cream and silver tones, subtle cosmetic line-art patterns, framed central product stage, clean premium minimal composition, soft shadows, no text, no bottle, no product, no logo, empty stage",
};

function clampSeed(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(2_147_483_647, Math.floor(value)));
}

function toUint8Array(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (Array.isArray(value) && value.every((n) => typeof n === "number")) {
    return Uint8Array.from(value);
  }
  if (value && typeof value === "object") {
    const maybe = value as Record<string, unknown>;
    if (typeof maybe.image === "string") return null; // handled as base64 string
  }
  return null;
}

function base64FromBytes(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function generateWithWorkersAi(
  env: Env,
  template: TemplateId,
  promptOverride?: string,
): Promise<{ dataUri: string } | null> {
  if (!env.AI || typeof env.AI.run !== "function") return null;

  const prompt = promptOverride?.trim() || PROMPTS[template] || PROMPTS[DEFAULT_TEMPLATE];

  try {
    const result = await env.AI.run("@cf/black-forest-labs/flux-1-schnell", {
      prompt,
      num_steps: 4,
    });

    if (typeof result === "string") {
      // Some runtimes return base64 directly
      if (result.startsWith("data:")) return { dataUri: result };
      return { dataUri: `data:image/png;base64,${result}` };
    }

    if (result && typeof result === "object") {
      const obj = result as Record<string, unknown>;
      if (typeof obj.image === "string") {
        const img = obj.image;
        return {
          dataUri: img.startsWith("data:")
            ? img
            : `data:image/png;base64,${img}`,
        };
      }
      const bytes = toUint8Array(obj.image ?? obj.data ?? obj.bytes ?? result);
      if (bytes) {
        return { dataUri: `data:image/png;base64,${base64FromBytes(bytes)}` };
      }
    }
  } catch (error) {
    console.error("Workers AI studio-scene generation failed, falling back.", error);
  }

  return null;
}

function pollinationsUrl(template: TemplateId, seed?: number, promptOverride?: string): string {
  const prompt = promptOverride?.trim() || PROMPTS[template] || PROMPTS[DEFAULT_TEMPLATE];
  const params = new URLSearchParams({
    width: "1080",
    height: "1920",
    nologo: "true",
    model: "flux",
  });
  if (typeof seed === "number") params.set("seed", String(seed));
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params.toString()}`;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
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

  const body = (payload && typeof payload === "object" ? payload : {}) as Record<
    string,
    unknown
  >;
  const template = (
    typeof body.template === "string" &&
    (Object.keys(PROMPTS) as TemplateId[]).includes(body.template as TemplateId)
      ? body.template
      : DEFAULT_TEMPLATE
  ) as TemplateId;
  const seed = clampSeed(body.seed);
  const promptOverride = typeof body.prompt === "string" ? body.prompt : undefined;

  const aiResult = await generateWithWorkersAi(env, template, promptOverride);
  if (aiResult) {
    return Response.json({
      success: true,
      provider: "cloudflare-ai",
      template,
      image: aiResult.dataUri,
      kind: "data-uri",
    });
  }

  return Response.json({
    success: true,
    provider: "pollinations",
    template,
    image: pollinationsUrl(template, seed, promptOverride),
    kind: "url",
    fallback: "env.AI unavailable; using Pollinations FLUX URL.",
  });
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const templateParam = url.searchParams.get("template") ?? DEFAULT_TEMPLATE;
  const template = (
    (Object.keys(PROMPTS) as TemplateId[]).includes(templateParam as TemplateId)
      ? templateParam
      : DEFAULT_TEMPLATE
  ) as TemplateId;
  const seedParam = url.searchParams.get("seed");
  const seed = seedParam ? clampSeed(Number(seedParam)) : undefined;
  const promptOverride = url.searchParams.get("prompt") || undefined;

  const aiResult = await generateWithWorkersAi(env, template, promptOverride);
  if (aiResult) {
    return Response.json({
      success: true,
      provider: "cloudflare-ai",
      template,
      image: aiResult.dataUri,
      kind: "data-uri",
    });
  }

  return Response.json({
    success: true,
    provider: "pollinations",
    template,
    image: pollinationsUrl(template, seed, promptOverride),
    kind: "url",
    fallback: "env.AI unavailable; using Pollinations FLUX URL.",
  });
};
