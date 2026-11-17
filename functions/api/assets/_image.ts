/**
 * Shared parsing helpers for the smart asset uploader.
 *
 * Everything accepts a `data:` URI (the dashboard downscales files in the
 * browser before uploading) so no temporary public URL is needed and the
 * packaging bytes never leave the request.
 */

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB decoded

/** Accepted input mime types mapped to the canonical type used downstream. */
const MIME_ALIASES = new Map<string, string>([
  ["image/png", "image/png"],
  ["image/jpeg", "image/jpeg"],
  ["image/jpg", "image/jpeg"],
  ["image/webp", "image/webp"],
  ["image/avif", "image/avif"],
]);

export function normalizeImageMime(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const mime = value.split(";")[0]?.trim().toLowerCase() ?? "";
  return MIME_ALIASES.get(mime) ?? null;
}

export function base64FromBytes(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

export interface ParsedImage {
  mime: string;
  base64: string;
  bytes: Uint8Array;
  dataUrl: string;
}

export type ImageParseResult =
  | { ok: true; image: ParsedImage }
  | { ok: false; status: number; error: string };

const DATA_URL_PATTERN =
  /^data:([a-z0-9.+/-]+);base64,([a-z0-9+/=\s]+)$/i;

/** Decodes and validates a base64 image data URI without trusting its header. */
export function parseImageDataUrl(value: string): ImageParseResult {
  if (typeof value !== "string" || !value.trim()) {
    return { ok: false, status: 400, error: "Missing imageDataUrl." };
  }
  if (value.length > MAX_IMAGE_BYTES * 2) {
    return {
      ok: false,
      status: 413,
      error: "Image payload is too large. Keep uploads under 8 MB.",
    };
  }

  const match = DATA_URL_PATTERN.exec(value.trim());
  if (!match) {
    return {
      ok: false,
      status: 400,
      error: "imageDataUrl must be a base64 data URI of a PNG, JPEG, WebP or AVIF image.",
    };
  }

  const mime = normalizeImageMime(match[1]);
  if (!mime) {
    return {
      ok: false,
      status: 415,
      error: "Unsupported image type. Use PNG, JPEG, WebP or AVIF.",
    };
  }

  const compact = match[2].replace(/\s+/g, "");
  if (!compact || compact.length < 8) {
    return { ok: false, status: 400, error: "Image data is empty." };
  }

  const padding = compact.endsWith("==") ? 2 : compact.endsWith("=") ? 1 : 0;
  const decodedSize = Math.floor((compact.length * 3) / 4) - padding;
  if (decodedSize <= 0) {
    return { ok: false, status: 400, error: "Image data is empty." };
  }
  if (decodedSize > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      status: 413,
      error: "Image payload is too large. Keep uploads under 8 MB.",
    };
  }

  let bytes: Uint8Array;
  try {
    const binary = atob(compact);
    bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
  } catch {
    return { ok: false, status: 400, error: "Image data is not valid base64." };
  }

  return {
    ok: true,
    image: {
      mime,
      base64: compact,
      bytes,
      dataUrl: `data:${mime};base64,${compact}`,
    },
  };
}

export function extensionForMime(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/avif":
      return "avif";
    default:
      return "jpg";
  }
}
