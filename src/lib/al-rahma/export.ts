/**
 * Client-side export helpers for WhatsApp Status creatives.
 *
 * SVGs may reference external packshot URLs and AI scene backgrounds; to render
 * them on a canvas without tainting we inline remote images as data URLs
 * (routed through the same-origin proxy when needed), then rasterize at exact
 * 1080x1920 dimensions.
 *
 * Packshot images (marked data-packshot="true") that have solid white/near-white
 * backgrounds are processed with edge flood-fill + chroma-keying and soft edge
 * feathering so the product bottle stands cleanly without a white box.
 */

export interface ExportCreative {
  id: string;
  product_id: string;
  product_name_arabic?: string | null;
  variant_number?: number | null;
  variant?: string;
  /** Rendered SVG markup (preferred). */
  svg?: string | null;
  /** data:image/svg+xml URI (fallback). */
  image_url?: string | null;
}

const WIDTH = 1080;
const HEIGHT = 1920;

function decodeSvgFromDataUri(uri: string): string | null {
  if (!uri.startsWith("data:image/svg+xml")) return null;
  const comma = uri.indexOf(",");
  if (comma === -1) return null;
  const meta = uri.slice(0, comma);
  const data = uri.slice(comma + 1);
  try {
    if (/;base64/i.test(meta)) {
      return atob(data);
    }
    return decodeURIComponent(data);
  } catch {
    return null;
  }
}

export function getCreativeSvg(creative: ExportCreative): string | null {
  if (creative.svg && creative.svg.trim().startsWith("<svg")) {
    return creative.svg;
  }
  if (creative.image_url) {
    return decodeSvgFromDataUri(creative.image_url);
  }
  return null;
}

function toProxyUrl(url: string): string {
  if (!/^https?:\/\//i.test(url)) return url;

  if (typeof window !== "undefined") {
    try {
      const resolved = new URL(url, window.location.href);
      if (resolved.origin === window.location.origin) {
        return resolved.toString();
      }
    } catch {
      // fall through to proxy
    }
  }

  return `/api/proxy-image?url=${encodeURIComponent(url)}`;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(blob);
  });
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}

/**
 * Remove solid white/near-white background from a packshot image.
 * Uses edge flood-fill to identify connected background regions and soft edge
 * feathering to avoid harsh cutout halos. Returns a transparent PNG data URL.
 * If the image appears to already have transparency or not be on a white bg,
 * returns the original data URL.
 */
async function removeWhiteBackground(dataUrl: string): Promise<string> {
  try {
    const img = await loadImage(dataUrl);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return dataUrl;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, w, h);
    const { data } = imageData;

    const idx = (x: number, y: number) => (y * w + x) * 4;
    const isNearWhite = (i: number) => {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a < 10) return true; // already transparent
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      // bright and low saturation
      return max >= 242 && min >= 228 && max - min <= 18;
    };

    // Sample corners to confirm white-ish background; if not, skip removal.
    const corners = [
      idx(0, 0),
      idx(w - 1, 0),
      idx(0, h - 1),
      idx(w - 1, h - 1),
      idx(Math.floor(w / 2), 0),
      idx(Math.floor(w / 2), h - 1),
      idx(0, Math.floor(h / 2)),
      idx(w - 1, Math.floor(h / 2)),
    ];
    const cornerWhite = corners.filter((i) => isNearWhite(i)).length;
    if (cornerWhite < 4) return dataUrl;

    const visited = new Uint8Array(w * h);
    const queue: number[] = [];
    const pushIfBg = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const p = y * w + x;
      if (visited[p]) return;
      if (!isNearWhite(idx(x, y))) return;
      visited[p] = 1;
      queue.push(p);
    };

    // Seed flood fill from all edge pixels that are near-white
    for (let x = 0; x < w; x++) {
      pushIfBg(x, 0);
      pushIfBg(x, h - 1);
    }
    for (let y = 0; y < h; y++) {
      pushIfBg(0, y);
      pushIfBg(w - 1, y);
    }

    let head = 0;
    while (head < queue.length) {
      const p = queue[head++];
      const x = p % w;
      const y = (p / w) | 0;
      pushIfBg(x + 1, y);
      pushIfBg(x - 1, y);
      pushIfBg(x, y + 1);
      pushIfBg(x, y - 1);
    }

    // If almost nothing removed, keep original (likely not a white-bg packshot)
    let removed = 0;
    for (let i = 0; i < visited.length; i++) if (visited[i]) removed++;
    if (removed < w * h * 0.02) return dataUrl;

    // Apply transparency and feather edges (soften boundary pixels)
    const isBg = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return true;
      return visited[y * w + x] === 1;
    };

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        const i = p * 4;
        if (visited[p]) {
          data[i + 3] = 0;
          continue;
        }
        // Feather: if adjacent to removed bg, reduce alpha softly
        let adj = 0;
        if (isBg(x + 1, y)) adj++;
        if (isBg(x - 1, y)) adj++;
        if (isBg(x, y + 1)) adj++;
        if (isBg(x, y - 1)) adj++;
        if (isBg(x + 1, y + 1)) adj++;
        if (isBg(x - 1, y - 1)) adj++;
        if (isBg(x + 1, y - 1)) adj++;
        if (isBg(x - 1, y + 1)) adj++;
        if (adj > 0) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const brightness = (r + g + b) / 3;
          // stronger feather for brighter edge pixels (typical white halo)
          const factor = brightness > 230 ? Math.max(0.35, 1 - adj * 0.12) : Math.max(0.6, 1 - adj * 0.06);
          data[i + 3] = Math.round(data[i + 3] * factor);
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL("image/png");
  } catch {
    return dataUrl;
  }
}

async function fetchAsDataUrl(url: string, isPackshot = false): Promise<string | null> {
  const candidates = /^https?:\/\//i.test(url)
    ? [toProxyUrl(url), url]
    : [url];
  const uniqueCandidates = Array.from(new Set(candidates));

  for (const candidate of uniqueCandidates) {
    try {
      const response = await fetch(candidate, {
        mode: "cors",
        credentials: "omit",
      });
      if (!response.ok) continue;
      const blob = await response.blob();
      let dataUrl = await blobToDataUrl(blob);
      if (isPackshot) {
        dataUrl = await removeWhiteBackground(dataUrl);
      }
      return dataUrl;
    } catch {
      // try next candidate (proxy first, then direct as fallback)
    }
  }

  return null;
}

async function inlineExternalImages(svg: string): Promise<string> {
  // Replace href/xlink:href on <image> elements pointing to http(s) URLs.
  const pattern =
    /<image\b[^>]*?\b(?:href|xlink:href)=["'](https?:\/\/[^"']+)["'][^>]*\/?>/gi;
  const matches = Array.from(svg.matchAll(pattern));
  if (matches.length === 0) return svg;

  const tasks = matches.map((m) => {
    const tag = m[0];
    const url = m[1];
    const isPackshot = /data-packshot=["']true["']/.test(tag) || /id=["']packshot["']/.test(tag);
    return { tag, url, isPackshot };
  });

  const uniqueKeys = new Map<string, { url: string; isPackshot: boolean }>();
  for (const t of tasks) {
    const key = `${t.isPackshot ? "p" : "s"}::${t.url}`;
    if (!uniqueKeys.has(key)) uniqueKeys.set(key, { url: t.url, isPackshot: t.isPackshot });
  }

  const replacements = new Map<string, string>();
  await Promise.all(
    Array.from(uniqueKeys.entries()).map(async ([key, info]) => {
      const dataUrl = await fetchAsDataUrl(info.url, info.isPackshot);
      if (dataUrl) replacements.set(key, dataUrl);
    }),
  );

  let result = svg;
  for (const [key, dataUrl] of replacements.entries()) {
    const [, ...rest] = key.split("::");
    const url = rest.join("::");
    if (url) {
      result = result.split(url).join(dataUrl);
    }
  }
  return result;
}

export async function svgToPngBlob(
  svgMarkup: string,
  width = WIDTH,
  height = HEIGHT,
): Promise<Blob> {
  const inlined = await inlineExternalImages(svgMarkup);
  const svgBlob = new Blob([inlined], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("تعذر تحميل صورة الإعلان للرسم."));
      img.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("تعذر إنشاء لوحة الرسم.");

    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) throw new Error("تعذر تحويل الإعلان إلى PNG.");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeName(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").slice(0, 80);
}

export function creativeFilename(creative: ExportCreative): string {
  const name = safeName(creative.product_name_arabic || creative.product_id || "creative");
  const variant = creative.variant_number ?? creative.variant ?? "v";
  return `${name}-v${variant}-1080x1920.png`;
}

export async function downloadCreativePng(creative: ExportCreative): Promise<void> {
  const svg = getCreativeSvg(creative);
  if (!svg) throw new Error("لا يوجد SVG متاح لهذا الإعلان.");
  const blob = await svgToPngBlob(svg);
  downloadBlob(blob, creativeFilename(creative));
}

export async function downloadCreativesZip(
  creatives: ExportCreative[],
  zipName = "al-rahma-daily-campaign.zip",
): Promise<void> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  for (const creative of creatives) {
    const svg = getCreativeSvg(creative);
    if (!svg) continue;
    try {
      const blob = await svgToPngBlob(svg);
      zip.file(creativeFilename(creative), blob);
    } catch {
      // skip failed creative; caller can report counts if needed
    }
  }

  const archive = await zip.generateAsync({ type: "blob" });
  downloadBlob(archive, zipName);
}
