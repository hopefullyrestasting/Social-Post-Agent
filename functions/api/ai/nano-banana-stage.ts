/**
 * POST /api/ai/nano-banana-stage
 *
 * Server-side photorealistic product staging via Google Gemini image generation
 * ("Nano Banana", gemini-2.5-flash-image). Places the authentic product bottle
 * onto a studio podium scene without altering labels/text. Falls back gracefully
 * to the existing BRIA cutout + studio-scene pipeline when unavailable.
 */

import { validateRemoteImageUrl } from "./remove-bg";

export interface NanoBananaEnv {
  GEMINI_API_KEY?: string;
}

type TemplateId = "silver-podium-botanical" | "botanical-arch-frame" | "editorial-beauty-card";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/avif",
]);

const STAGING_PROMPT =
  "Place this exact product bottle untouched—preserving every original label word, graphic, cap shape, and color—standing centered on top of a minimalist 3D white marble and brushed silver hexagonal podium in the lower third of a 9:16 vertical studio frame. Soft light silver-grey studio wall with subtle diagonal botanical leaf shadows, lush green palm and eucalyptus leaves framing bottom corners, small glossy silver-pearl spheres floating softly, realistic contact shadow under the bottle, studio ambient rim lighting, NO text, NO watermarks, NO added logos.";

function base64FromBytes(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function normalizeImageContentType(value: string | null): string | null {
  if (!value) return null;
  const mime = value.split(";")[0]?.trim().toLowerCase() ?? "";
  return ALLOWED_IMAGE_TYPES.has(mime) ? mime : null;
}

async function fetchSourceImage(imageUrl: string): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
  const validation = validateRemoteImageUrl(imageUrl);
  if (!validation.ok) return null;

  let upstream: Response;
  try {
    upstream = await fetch(validation.url.toString(), {
      method: "GET",
      redirect: "follow",
      headers: {
        Accept: "image/png,image/jpeg,image/webp,image/avif,image/*;q=0.8,*/*;q=0.5",
        "User-Agent": "AlRahma-NanoBanana/1.0",
      },
    });
  } catch {
    return null;
  }

  try {
    const finalUrl = new URL(upstream.url || validation.url.toString());
    if ((finalUrl.protocol !== "http:" && finalUrl.protocol !== "https:")) return null;
    const recheck = validateRemoteImageUrl(finalUrl.toString());
    if (!recheck.ok) return null;
  } catch {
    // ignore
  }

  if (!upstream.ok) return null;

  const mimeType = normalizeImageContentType(upstream.headers.get("content-type"));
  if (!mimeType) return null;

  const lengthHeader = upstream.headers.get("content-length");
  if (lengthHeader) {
    const length = Number(lengthHeader);
    if (Number.isFinite(length) && length > MAX_BYTES) return null;
  }

  try {
    const ab = await upstream.arrayBuffer();
    if (!ab || ab.byteLength === 0 || ab.byteLength > MAX_BYTES) return null;
    return { bytes: new Uint8Array(ab), mimeType };
  } catch {
    return null;
  }
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

export async function stageProductWithNanoBanana(
  env: NanoBananaEnv,
  productImageUrl: string,
  template: TemplateId,
): Promise<string | null> {
  void template;
  const key = env.GEMINI_API_KEY?.trim();
  if (!key) return null;

  const imageUrl = typeof productImageUrl === "string" ? productImageUrl.trim() : "";
  if (!imageUrl) return null;

  try {
    const source = await fetchSourceImage(imageUrl);
    if (!source) return null;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${encodeURIComponent(key)}`;
    const body = {
      contents: [
        {
          parts: [
            {
              inline_data: {
                mime_type: source.mimeType,
                data: base64FromBytes(source.bytes),
              },
            },
            { text: STAGING_PROMPT },
          ],
        },
      ],
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
      return null; // missing key/quota/auth/model issues -> graceful fallback
    }

    const json = await res.json();
    return extractInlineImage(json);
  } catch (error) {
    console.error("Nano Banana staging failed, falling back.", error);
    return null;
  }
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
  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
  const template = (typeof body.template === "string" ? body.template : "silver-podium-botanical") as TemplateId;
  if (!imageUrl) {
    return Response.json({ success: false, error: "Missing required imageUrl." }, { status: 400 });
  }

  const validation = validateRemoteImageUrl(imageUrl);
  if (!validation.ok) {
    return Response.json({ success: false, error: validation.error }, { status: validation.status });
  }

  const image = await stageProductWithNanoBanana(env, imageUrl, template);
  if (!image) {
    return Response.json({
      success: false,
      error: "Nano Banana staging unavailable; fallback to existing pipeline.",
      fallback: true,
    }, { status: 502 });
  }

  return Response.json({
    success: true,
    provider: "google-gemini-nano-banana",
    model: "gemini-2.5-flash-image",
    template,
    image,
    kind: "data-uri",
  });
};
