import { escapeXml } from "./svg-utils";

/**
 * Background/scene layer for the ad composer.
 *
 * Scenes are pure edge-to-edge studio stages (no text, no bottles/products, no
 * podium). The authentic packshot is composited as a full-bleed hero by the
 * overlay system, so backgrounds must be clean, bright editorial textures that
 * blend seamlessly across the full 1080x1920 canvas (including under
 * multiply-blended non-cutout packshots).
 *
 * Default behavior is a deterministic SVG soft-light editorial fallback.
 * When an AI scene image is provided (embedded data URI), it is used as the
 * photographic stage.
 */

export type DesignerTemplate =
  | "silver-podium-botanical"
  | "botanical-arch-frame"
  | "editorial-beauty-card";

export type BackgroundProviderId =
  | "deterministic-studio"
  | "cloudflare-ai"
  | "pollinations"
  | "muapi";

export interface BackgroundRequest {
  width: number;
  height: number;
  template: DesignerTemplate;
  sceneImageUrl?: string | null;
}

export interface BackgroundLayer {
  provider: BackgroundProviderId;
  requestedProvider: BackgroundProviderId;
  kind: "scene" | "image";
  template: DesignerTemplate;
  markup: string;
  fallbackReason?: string;
}

function sharedDefs(): string {
  return `
    <defs>
      <linearGradient id="studio-wall" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#FCFCFD" />
        <stop offset="45%" stop-color="#F5F6F7" />
        <stop offset="100%" stop-color="#ECEFF3" />
      </linearGradient>
      <radialGradient id="studio-light-core" cx="50%" cy="28%" r="58%">
        <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.96" />
        <stop offset="55%" stop-color="#F8FAFC" stop-opacity="0.38" />
        <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="studio-warm-glow" cx="52%" cy="42%" r="62%">
        <stop offset="0%" stop-color="#FFF7ED" stop-opacity="0.22" />
        <stop offset="100%" stop-color="#FFF7ED" stop-opacity="0" />
      </radialGradient>
      <linearGradient id="limestone-vein" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#94A3B8" stop-opacity="0.00" />
        <stop offset="45%" stop-color="#94A3B8" stop-opacity="0.06" />
        <stop offset="55%" stop-color="#CBD5E1" stop-opacity="0.05" />
        <stop offset="100%" stop-color="#94A3B8" stop-opacity="0.00" />
      </linearGradient>
      <filter id="soft-blur" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="18" />
      </filter>
      <filter id="leaf-shadow-blur" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="14" />
      </filter>
    </defs>
  `.trim();
}

function bokehLights(points: Array<[number, number, number, string, number]>): string {
  return points
    .map(
      ([x, y, r, color, opacity]) =>
        `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" fill-opacity="${opacity}" filter="url(#soft-blur)" />`,
    )
    .join("\n");
}

function wallBackdrop(width: number, height: number): string {
  return `
    <rect width="${width}" height="${height}" fill="url(#studio-wall)" />
    <rect width="${width}" height="${height}" fill="url(#studio-light-core)" />
    <rect width="${width}" height="${height}" fill="url(#studio-warm-glow)" />
    <rect width="${width}" height="${height}" fill="url(#limestone-vein)" fill-opacity="0.35" />
  `.trim();
}

function botanicalShadows(width: number): string {
  // Soft, full-bleed botanical shadows cast on the wall — no podium, no floor.
  return `
    <g id="botanical-shadows" opacity="0.55">
      <g filter="url(#leaf-shadow-blur)" fill="#334155">
        <path d="M -40 420 C 220 260, 420 340, 520 560 C 320 620, 120 640, -40 520 Z" fill-opacity="0.10" />
        <path d="M ${width + 40} 460 C ${width - 220} 280, ${width - 420} 360, ${width - 520} 580 C ${width - 320} 640, ${width - 120} 660, ${width + 40} 560 Z" fill-opacity="0.10" />
        <ellipse cx="140" cy="980" rx="220" ry="70" transform="rotate(-18 140 980)" fill-opacity="0.07" />
        <ellipse cx="${width - 140}" cy="1020" rx="220" ry="70" transform="rotate(18 ${width - 140} 1020)" fill-opacity="0.07" />
        <ellipse cx="${width / 2}" cy="1380" rx="360" ry="90" fill="#FFFFFF" fill-opacity="0.12" />
      </g>
      <g id="corner-foliage" opacity="0.22">
        <path d="M -20 1180 C 120 960, 260 900, 360 980 C 240 1020, 140 1120, 60 1240 Z" fill="#166534" />
        <path d="M ${width + 20} 1200 C ${width - 120} 980, ${width - 260} 920, ${width - 360} 1000 C ${width - 240} 1040, ${width - 140} 1140, ${width - 60} 1260 Z" fill="#166534" />
      </g>
    </g>
  `.trim();
}

function silverPodiumBotanical(width: number, height: number): string {
  return `
    ${sharedDefs()}
    ${wallBackdrop(width, height)}
    ${bokehLights([
      [160, 260, 90, "#FFFFFF", 0.14],
      [900, 320, 110, "#FFFFFF", 0.10],
      [540, 860, 180, "#FFFFFF", 0.08],
    ])}
    ${botanicalShadows(width)}
  `.trim();
}

function botanicalArchFrame(width: number, height: number): string {
  const archW = 820;
  const archH = 1120;
  const archX = (width - archW) / 2;
  const archY = 260;
  const r = archW / 2;
  return `
    ${sharedDefs()}
    ${wallBackdrop(width, height)}
    <g id="arch-scene" opacity="0.22">
      <path d="M ${archX} ${archY + archH} L ${archX} ${archY + r} A ${r} ${r} 0 0 1 ${archX + archW} ${archY + r} L ${archX + archW} ${archY + archH} Z" fill="#FFFFFF" fill-opacity="0.18" stroke="#FFFFFF" stroke-opacity="0.30" stroke-width="2" />
    </g>
    ${bokehLights([
      [200, 300, 80, "#FFF7ED", 0.10],
      [880, 340, 90, "#FFFFFF", 0.10],
      [540, 900, 200, "#FFFFFF", 0.08],
    ])}
    ${botanicalShadows(width)}
  `.trim();
}

function editorialBeautyCard(width: number, height: number): string {
  return `
    ${sharedDefs()}
    <linearGradient id="mint-mist" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#F7FBF9" />
      <stop offset="50%" stop-color="#F4F8F7" />
      <stop offset="100%" stop-color="#EEF4F2" />
    </linearGradient>
    <rect width="${width}" height="${height}" fill="url(#mint-mist)" />
    <rect width="${width}" height="${height}" fill="url(#studio-light-core)" />
    ${bokehLights([
      [180, 320, 80, "#FFFFFF", 0.12],
      [900, 360, 90, "#ECFDF5", 0.10],
      [540, 920, 220, "#FFFFFF", 0.08],
    ])}
    ${botanicalShadows(width)}
  `.trim();
}

export function deterministicSceneMarkup(
  template: DesignerTemplate,
  width: number,
  height: number,
): string {
  switch (template) {
    case "botanical-arch-frame":
      return botanicalArchFrame(width, height);
    case "editorial-beauty-card":
      return editorialBeautyCard(width, height);
    case "silver-podium-botanical":
    default:
      return silverPodiumBotanical(width, height);
  }
}

export function resolveBackground(request: BackgroundRequest): BackgroundLayer {
  const { width, height, template } = request;
  const sceneImageUrl = request.sceneImageUrl?.trim() || null;

  // PNG-safe export: never emit external/relative scene URLs (e.g. /studio-scenes/*.svg).
  // Only embedded data-image URIs are safe for standalone SVG->Canvas rasterization.
  if (sceneImageUrl && sceneImageUrl.startsWith("data:image/")) {
    const provider: BackgroundProviderId = "cloudflare-ai";
    return {
      provider,
      requestedProvider: provider,
      kind: "image",
      template,
      markup: `
        <image href="${escapeXml(sceneImageUrl)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" />
        <rect width="${width}" height="${height}" fill="#FFFFFF" fill-opacity="0.02" />
      `.trim(),
    };
  }

  return {
    provider: "deterministic-studio",
    requestedProvider: "deterministic-studio",
    kind: "scene",
    template,
    markup: deterministicSceneMarkup(template, width, height),
    fallbackReason: sceneImageUrl ? "non-data scene URL not embeddable; rendered inline vector studio fallback" : undefined,
  };
}

export function templateForVariant(
  variantNumber: 1 | 2,
  seed: string,
): DesignerTemplate {
  if (variantNumber === 1) return "silver-podium-botanical";
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 2 === 0
    ? "botanical-arch-frame"
    : "editorial-beauty-card";
}
