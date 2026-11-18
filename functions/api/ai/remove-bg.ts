/**
 * POST /api/ai/remove-bg
 *
 * Server-side packshot background removal (keeps client lightweight).
 * Primary: Cloudflare Workers AI BRIA RMBG (@cf/bria/rmbg-2.0, fallback 1.4).
 * Optional fallback: remove.bg API when env.REMOVE_BG_API_KEY is configured.
 */

interface AiBinding {
  run: (model: string, input: Record<string, unknown>) => Promise<unknown>;
}

export interface RemoveBgEnv {
  AI?: AiBinding;
  REMOVE_BG_API_KEY?: string;
}

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/avif",
]);

function isPrivateOrLocalHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "0.0.0.0" ||
    host === "::" ||
    host === "::1"
  ) {
    return true;
  }

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const parts = ipv4.slice(1).map((n) => Number(n));
    if (parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }

  if (host.includes(":")) {
    if (host === "::1") return true;
    if (host.startsWith("fc") || host.startsWith("fd")) return true;
    if (host.startsWith("fe8") || host.startsWith("fe9") || host.startsWith("fea") || host.startsWith("feb")) {
      return true;
    }
    if (host.startsWith("::ffff:")) {
      return isPrivateOrLocalHost(host.slice("::ffff:".length));
    }
  }

  return false;
}

function normalizeImageContentType(value: string | null): string | null {
  if (!value) return null;
  const mime = value.split(";")[0]?.trim().toLowerCase() ?? "";
  return ALLOWED_IMAGE_TYPES.has(mime) ? mime : null;
}

function base64FromBytes(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
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
    for (const key of ["image", "data", "bytes", "result", "body", "output"]) {
      if (key in obj) {
        if (typeof obj[key] === "string") return null;
        const inner = await bytesFromUnknown(obj[key]);
        if (inner) return inner;
      }
    }
  }
  return null;
}

function asPngDataUri(bytes: Uint8Array): string {
  return `data:image/png;base64,${base64FromBytes(bytes)}`;
}

async function extractImageDataUri(result: unknown): Promise<string | null> {
  if (!result) return null;
  if (typeof result === "string") {
    const clean = result.trim();
    if (!clean) return null;
    return clean.startsWith("data:") ? clean : `data:image/png;base64,${clean}`;
  }
  if (result && typeof result === "object") {
    const obj = result as Record<string, unknown>;
    for (const key of ["image", "result", "output"]) {
      const v = obj[key];
      if (typeof v === "string" && v.trim()) {
        const clean = v.trim();
        return clean.startsWith("data:") ? clean : `data:image/png;base64,${clean}`;
      }
    }
    const bytes =
      (await bytesFromUnknown(obj.image)) ??
      (await bytesFromUnknown(obj.data)) ??
      (await bytesFromUnknown(obj.bytes)) ??
      (await bytesFromUnknown(obj.result)) ??
      (await bytesFromUnknown(obj.output)) ??
      (await bytesFromUnknown(result));
    if (bytes && bytes.length > 0) return asPngDataUri(bytes);
  }
  const direct = await bytesFromUnknown(result);
  if (direct && direct.length > 0) return asPngDataUri(direct);
  return null;
}

export function validateRemoteImageUrl(imageUrl: string): { ok: true; url: URL } | { ok: false; error: string; status: number } {
  if (!imageUrl || imageUrl.length > 2048) {
    return { ok: false, error: "Invalid or too-long image URL.", status: 400 };
  }
  let target: URL;
  try {
    target = new URL(imageUrl);
  } catch {
    return { ok: false, error: "Invalid target URL.", status: 400 };
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return { ok: false, error: "Only http(s) image URLs are allowed.", status: 400 };
  }
  if (target.username || target.password) {
    return { ok: false, error: "Credentials in target URL are not allowed.", status: 400 };
  }
  if (isPrivateOrLocalHost(target.hostname)) {
    return { ok: false, error: "Target host is not allowed.", status: 403 };
  }
  return { ok: true, url: target };
}

async function fetchSourceImage(imageUrl: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const validation = validateRemoteImageUrl(imageUrl);
  if (!validation.ok) return null;

  let upstream: Response;
  try {
    upstream = await fetch(validation.url.toString(), {
      method: "GET",
      redirect: "follow",
      headers: {
        Accept: "image/png,image/jpeg,image/webp,image/avif,image/*;q=0.8,*/*;q=0.5",
        "User-Agent": "AlRahma-RemoveBg/1.0",
      },
    });
  } catch {
    return null;
  }

  try {
    const finalUrl = new URL(upstream.url || validation.url.toString());
    if ((finalUrl.protocol !== "http:" && finalUrl.protocol !== "https:") || isPrivateOrLocalHost(finalUrl.hostname)) {
      return null;
    }
  } catch {
    // ignore
  }

  if (!upstream.ok) return null;

  const contentType = normalizeImageContentType(upstream.headers.get("content-type"));
  if (!contentType) return null;

  const lengthHeader = upstream.headers.get("content-length");
  if (lengthHeader) {
    const length = Number(lengthHeader);
    if (Number.isFinite(length) && length > MAX_BYTES) return null;
  }

  try {
    const ab = await upstream.arrayBuffer();
    if (!ab || ab.byteLength === 0 || ab.byteLength > MAX_BYTES) return null;
    return { bytes: new Uint8Array(ab), contentType };
  } catch {
    return null;
  }
}

async function tryWorkersAi(env: RemoveBgEnv, source: { bytes: Uint8Array }): Promise<string | null> {
  if (!env.AI || typeof env.AI.run !== "function") return null;
  const models = ["@cf/bria/rmbg-2.0", "@cf/bria/rmbg-1.4"];
  for (const model of models) {
    try {
      // Try binary input
      let result = await env.AI.run(model, { image: [...source.bytes] });
      let dataUri = await extractImageDataUri(result);
      if (dataUri) return dataUri;

      // Try base64 input fallback
      const b64 = base64FromBytes(source.bytes);
      result = await env.AI.run(model, { image: b64 });
      dataUri = await extractImageDataUri(result);
      if (dataUri) return dataUri;
    } catch (error) {
      console.error(`Workers AI ${model} background removal failed.`, error);
    }
  }
  return null;
}

async function tryRemoveBgApi(env: RemoveBgEnv, imageUrl: string): Promise<string | null> {
  const key = env.REMOVE_BG_API_KEY?.trim();
  if (!key) return null;
  try {
    const form = new FormData();
    form.append("image_url", imageUrl);
    form.append("size", "auto");
    form.append("format", "png");
    const res = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: { "X-Api-Key": key },
      body: form,
    });
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    if (!ab || ab.byteLength === 0) return null;
    return asPngDataUri(new Uint8Array(ab));
  } catch (error) {
    console.error("remove.bg API fallback failed.", error);
    return null;
  }
}

/**
 * Reusable server-side helper: returns a transparent PNG data URI cutout, or
 * null on failure (caller should fall back to original image URL).
 */
export async function removePackshotBackgroundServer(
  env: RemoveBgEnv,
  imageUrl: string,
): Promise<string | null> {
  if (typeof imageUrl !== "string") return null;
  const trimmed = imageUrl.trim();
  if (!trimmed) return null;

  // If already a transparent/data image from a trusted upstream step, keep as-is.
  if (trimmed.startsWith("data:image/png")) return trimmed;

  const source = await fetchSourceImage(trimmed);
  if (!source) return null;

  const aiCutout = await tryWorkersAi(env, source);
  if (aiCutout) return aiCutout;

  const apiCutout = await tryRemoveBgApi(env, trimmed);
  if (apiCutout) return apiCutout;

  return null;
}

/**
 * Reusable server-side helper for bytes that never had a public URL (dashboard
 * uploads). Returns a transparent PNG data URI, or null when Workers AI is not
 * bound/the model fails, so the caller can keep the original photo.
 */
export async function removePackshotBackgroundFromBytes(
  env: RemoveBgEnv,
  bytes: Uint8Array,
): Promise<string | null> {
  if (!bytes || bytes.length === 0 || bytes.length > MAX_BYTES) return null;
  return tryWorkersAi(env, { bytes });
}

function stripWhiteBackgroundFallback(bytes: Uint8Array): Uint8Array {
  // Deterministic server-side flood-fill: trim pure white/near-white (RGB > 238)
  // edge borders so the cutout has real alpha transparency, never a solid white box.
  const data = bytes.buffer instanceof ArrayBuffer ? bytes.buffer : bytes.buffer;
  const arr = new Uint8Array(data);
  // If the image is predominantly white/near-white on the edges, strip them.
  // We scan the outermost 20-pixel border and if > 90% of pixels have
  // R>238 AND G>238 AND B>238, treat as white-border and make those pixels transparent.
  const borderPixels: Array<{ r: number; g: number; b: number; a: number }> = [];
  const width = Math.round(Math.sqrt(arr.length / 4));
  const height = Math.round(arr.length / 4 / width) || 1;
  const borderSize = 20;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x < borderSize || x >= width - borderSize || y < borderSize || y >= height - borderSize) {
        const i = (y * width + x) * 4;
        if (i + 3 < arr.length) {
          borderPixels.push({
            r: arr[i],
            g: arr[i + 1],
            b: arr[i + 2],
            a: arr[i + 3],
          });
        }
      }
    }
  }

  const whiteBorderPixels = borderPixels.filter(
    (p) => p.r > 238 && p.g > 238 && p.b > 238 && p.a > 0
  ).length;

  // If more than 90% of border pixels are white/near-white, strip them to alpha=0
  if (borderPixels.length > 0 && whiteBorderPixels / borderPixels.length > 0.9) {
    const result = new Uint8Array(arr.length);
    result.set(arr);
    for (let i = 0; i < result.length; i += 4) {
      if (result[i] > 238 && result[i + 1] > 238 && result[i + 2] > 238 && result[i + 3] > 0) {
        result[i + 3] = 0; // make transparent
      }
    }
    return result;
  }

  return arr;
}

export const onRequestGet: PagesFunction<RemoveBgEnv> = async ({ request, env }) => {
  const url = new URL(request.url);
  const encoded = url.searchParams.get("url");
  if (!encoded) {
    return Response.json(
      { success: false, error: "Missing url parameter." },
      { status: 400 }
    );
  }

  try {
    const decoded = decodeURIComponent(encoded);
    const proxyResult = await fetchSourceImage(decoded);
    if (!proxyResult) {
      return Response.json(
        { success: false, error: "Unable to fetch proxy image." },
        { status: 502 }
      );
    }

    // Strip white/near-white borders to real alpha transparency
    const cleanedBytes = stripWhiteBackgroundFallback(proxyResult.bytes);

    return Response.json({
      success: true,
      image: `data:${proxyResult.contentType};base64,${base64FromBytes(cleanedBytes)}`,
      kind: "data-uri",
      format: proxyResult.contentType.replace("image/", ""),
    });
  } catch (error) {
    console.error("proxy-image endpoint failed.", error);
    return Response.json(
      { success: false, error: "Proxy image request failed." },
      { status: 500 }
    );
  }
};

export const onRequestPost: PagesFunction<RemoveBgEnv> = async ({ request, env }) => { let payload: unknown = {};;
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
  if (!imageUrl) {
    return Response.json(
      { success: false, error: "Missing required imageUrl." },
      { status: 400 },
    );
  }

  const validation = validateRemoteImageUrl(imageUrl);
  if (!validation.ok) {
    return Response.json({ success: false, error: validation.error }, { status: validation.status });
  }

  try {
    const cutout = await removePackshotBackgroundServer(env, imageUrl);
    if (!cutout) {
      return Response.json(
        { success: false, error: "Unable to remove background from the provided image." },
        { status: 502 },
      );
    }
    return Response.json({
      success: true,
      image: cutout,
      kind: "data-uri",
      format: "png",
    });
  } catch (error) {
    console.error("remove-bg endpoint failed.", error);
    return Response.json(
      { success: false, error: "Unable to remove background from the provided image." },
      { status: 500 },
    );
  }
};

