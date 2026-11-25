/**
 * Browser-side preparation for one-time brand logo uploads.
 *
 * The studio already has a hardened multipart storage pipeline at
 * `/api/assets/upload`. Logos go through that same pipeline, but they are
 * normalised here first so:
 *  - SVG artwork is rasterised (no script-bearing SVG reaches storage),
 *  - oversized photos are downscaled to fit the embedded/D1 data-URI budget,
 *  - the resulting URL is accepted by `/api/tenant/lock-brand`.
 */

export const LOGO_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
] as const;

export type SupportedLogoMime = (typeof LOGO_MIME_TYPES)[number];

/** Keep the stored data URI comfortably under the brand-lock 500 KB limit. */
export const LOGO_TARGET_BYTES = 350_000;
const LOGO_MAX_SOURCE_BYTES = 8 * 1024 * 1024;

export function logoAcceptAttribute(): string {
  return LOGO_MIME_TYPES.join(",");
}

export function isSupportedLogoMime(value: string): value is SupportedLogoMime {
  const mime = value.split(";")[0]?.trim().toLowerCase() ?? "";
  return (LOGO_MIME_TYPES as readonly string[]).includes(mime);
}

/** Read the asset URL from either the R2 or embedded-storage upload response. */
export function usableAssetUrl(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const asset = (body as { asset?: unknown }).asset;
  if (!asset || typeof asset !== "object") return null;
  const record = asset as Record<string, unknown>;
  for (const key of ["usable_url", "url"] as const) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Unable to read the logo image."));
    };
    image.src = objectUrl;
  });
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Unable to encode the logo."))),
      type,
      quality,
    );
  });
}

/**
 * Returns a file that the existing upload endpoint can store and brand-lock can
 * reference. Raster files under the budget are passed through unchanged.
 */
export async function prepareLogoFile(file: File): Promise<File> {
  const mime = file.type.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!isSupportedLogoMime(mime)) {
    throw new Error("Unsupported logo type. Use PNG, JPEG, WebP or SVG.");
  }
  if (!file.size) throw new Error("The logo file is empty.");
  if (file.size > LOGO_MAX_SOURCE_BYTES) {
    throw new Error("Logo is larger than 8 MB. Choose a smaller file.");
  }
  if (mime !== "image/svg+xml" && file.size <= LOGO_TARGET_BYTES) return file;

  const image = await loadImage(file);
  const width = image.naturalWidth || image.width || 800;
  const height = image.naturalHeight || image.height || 800;

  for (const attempt of [
    { edge: 800, type: "image/webp", quality: 0.86 },
    { edge: 640, type: "image/webp", quality: 0.78 },
    { edge: 512, type: "image/png", quality: undefined },
  ] as const) {
    const scale = Math.min(1, attempt.edge / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable in this browser.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    let blob: Blob;
    try {
      blob = await canvasBlob(canvas, attempt.type, attempt.quality);
    } catch {
      continue;
    }
    if (blob.size <= LOGO_TARGET_BYTES) {
      const extension = blob.type === "image/png" ? "png" : "webp";
      return new File([blob], `logo.${extension}`, { type: blob.type || attempt.type });
    }
  }

  throw new Error("Logo is too large. Choose a simpler or smaller file.");
}
