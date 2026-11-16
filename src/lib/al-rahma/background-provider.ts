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
  | "simple-botanical-horizon"
  | "silver-podium-botanical"
  | "botanical-arch-frame"
  | "editorial-beauty-card";

export type BackgroundProviderId =
  | "deterministic-studio"
  | "cloudflare-ai"
  | "pollinations"
  | "muapi";

/**
 * Adaptive colour palettes for the Simple editorial theme. The studio wall and
 * glossy floor are colour-matched to the product packaging mood so the same
 * composition works for skincare, haircare and luxury fragrance.
 */
export type SimplePaletteKey =
  | "fresh-sage"
  | "blush-apricot"
  | "golden-sage"
  | "luxury-emerald";

export interface SimplePalette {
  key: SimplePaletteKey;
  wallFrom: string;
  wallMid: string;
  wallTo: string;
  floorFrom: string;
  floorMid: string;
  floorTo: string;
  leafLight: string;
  leafMid: string;
  leafDark: string;
}

export const SIMPLE_HORIZON_Y = 1240;

export const SIMPLE_PALETTES: Record<SimplePaletteKey, SimplePalette> = {
  "fresh-sage": {
    key: "fresh-sage",
    wallFrom: "#5A9A48",
    wallMid: "#6BAA59",
    wallTo: "#7AB864",
    floorFrom: "#65A852",
    floorMid: "#4E8C3D",
    floorTo: "#3E7830",
    leafLight: "#C4E8A6",
    leafMid: "#63B14E",
    leafDark: "#2F6B33",
  },
  "blush-apricot": {
    key: "blush-apricot",
    wallFrom: "#C87D8A",
    wallMid: "#D693A0",
    wallTo: "#E5A9B4",
    floorFrom: "#B86B78",
    floorMid: "#9A5764",
    floorTo: "#7D3F4B",
    leafLight: "#F6E3CF",
    leafMid: "#7FA86F",
    leafDark: "#3F6B44",
  },
  "golden-sage": {
    key: "golden-sage",
    wallFrom: "#6E9B63",
    wallMid: "#7EAC73",
    wallTo: "#8FBC83",
    floorFrom: "#5C8A52",
    floorMid: "#3E6636",
    floorTo: "#2C4A26",
    leafLight: "#DCE9BC",
    leafMid: "#7FAE63",
    leafDark: "#456B3A",
  },
  "luxury-emerald": {
    key: "luxury-emerald",
    wallFrom: "#1B3B32",
    wallMid: "#244B40",
    wallTo: "#2D5A4C",
    floorFrom: "#142E27",
    floorMid: "#0F241E",
    floorTo: "#0B1B16",
    leafLight: "#8FB8A1",
    leafMid: "#3E6B57",
    leafDark: "#1F3D33",
  },
};

export interface SimplePaletteContext {
  brand?: string | null;
  category?: string | null;
  name?: string | null;
  benefits?: string[] | null;
}

/**
 * Deterministically pick the Simple palette from product category/brand/name.
 * Perfumes and oud go dark emerald-charcoal, kids go blush-apricot, haircare
 * with argan goes warm golden sage, everything else stays fresh sage-green.
 */
export function resolveSimplePaletteKey(
  context?: SimplePaletteContext,
): SimplePaletteKey {
  const haystack = [
    context?.brand,
    context?.category,
    context?.name,
    ...(context?.benefits ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/(perfume|fragrance|oud|عود|عطر|برفان|بارفان|luxury|فخم)/.test(haystack)) {
    return "luxury-emerald";
  }
  if (/(kids|children|child|أطفال|اطفال|مينك|mink|baby|بيبى)/.test(haystack)) {
    return "blush-apricot";
  }
  if (/(argan|أرغان|ارجان|vatika|فاتيكا|penduline|بندولين|hair|شعر|شامبو|بلسم|زيت)/.test(haystack)) {
    return "golden-sage";
  }
  return "fresh-sage";
}

export interface BackgroundRequest {
  width: number;
  height: number;
  template: DesignerTemplate;
  sceneImageUrl?: string | null;
  /** Simple theme colour mood; defaults to fresh sage-green. */
  palette?: SimplePaletteKey;
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

function simpleDefs(palette: SimplePalette): string {
  return `
    <defs>
      <linearGradient id="simple-wall" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="${palette.wallFrom}" />
        <stop offset="62%" stop-color="${palette.wallMid}" />
        <stop offset="100%" stop-color="${palette.wallTo}" />
      </linearGradient>
      <linearGradient id="simple-floor" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="${palette.floorFrom}" />
        <stop offset="55%" stop-color="${palette.floorMid}" />
        <stop offset="100%" stop-color="${palette.floorTo}" />
      </linearGradient>
      <linearGradient id="simple-floor-sheen" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.26" />
        <stop offset="22%" stop-color="#FFFFFF" stop-opacity="0.05" />
        <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0" />
      </linearGradient>
      <radialGradient id="simple-sky-glow" cx="50%" cy="24%" r="64%">
        <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.30" />
        <stop offset="58%" stop-color="#FFFFFF" stop-opacity="0.07" />
        <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="simple-horizon-glow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.40" />
        <stop offset="55%" stop-color="#FFFFFF" stop-opacity="0.12" />
        <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0" />
      </radialGradient>
      <linearGradient id="simple-leaf" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="${palette.leafDark}" />
        <stop offset="55%" stop-color="${palette.leafMid}" />
        <stop offset="100%" stop-color="${palette.leafLight}" />
      </linearGradient>
      <filter id="simple-cloud-blur" x="-40%" y="-60%" width="180%" height="220%">
        <feGaussianBlur stdDeviation="12" />
      </filter>
      <filter id="simple-leaf-blur" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="5" />
      </filter>
    </defs>
  `.trim();
}

function cumulusCloud(
  cx: number,
  cy: number,
  scale: number,
  opacity: number,
): string {
  return `
    <g transform="translate(${cx} ${cy}) scale(${scale})" filter="url(#simple-cloud-blur)" fill="#FFFFFF" fill-opacity="${opacity}">
      <ellipse cx="0" cy="4" rx="118" ry="50" />
      <ellipse cx="-62" cy="18" rx="70" ry="38" fill-opacity="${(opacity * 0.85).toFixed(2)}" />
      <ellipse cx="58" cy="16" rx="76" ry="40" fill-opacity="${(opacity * 0.85).toFixed(2)}" />
      <ellipse cx="-26" cy="-30" rx="64" ry="46" fill-opacity="${(opacity * 0.95).toFixed(2)}" />
      <ellipse cx="34" cy="-24" rx="54" ry="38" fill-opacity="${(opacity * 0.9).toFixed(2)}" />
      <ellipse cx="2" cy="30" rx="104" ry="24" fill-opacity="${(opacity * 0.6).toFixed(2)}" />
    </g>
  `.trim();
}

function mintLeaf(
  x: number,
  y: number,
  rotate: number,
  scale: number,
  opacity: number,
): string {
  return `
    <g transform="translate(${x} ${y}) rotate(${rotate}) scale(${scale})">
      <path d="M 0 0 C -34 -34, -42 -104, 0 -152 C 42 -104, 34 -34, 0 0 Z" fill="url(#simple-leaf)" fill-opacity="${opacity}" />
      <path d="M 0 -8 L 0 -138" stroke="#FFFFFF" stroke-opacity="0.18" stroke-width="2" fill="none" />
      <path d="M 0 -42 C -16 -58, -22 -74, -24 -92 M 0 -42 C 16 -58, 22 -74, 24 -92 M 0 -82 C -12 -94, -16 -104, -18 -116 M 0 -82 C 12 -94, 16 -104, 18 -116" stroke="${paletteLeafVein()}" stroke-opacity="0.22" stroke-width="1.6" fill="none" />
    </g>
  `.trim();
}

/** Leaf vein accent stays neutral so it works across every palette. */
function paletteLeafVein(): string {
  return "#0B1B16";
}

function botanicalBase(width: number): string {
  const cx = width / 2;
  return `
    <g id="botanical-base">
      <!-- Soft base shadow anchoring the leaf cluster on the horizon -->
      <ellipse cx="${cx}" cy="1258" rx="430" ry="54" fill="#0B1B16" fill-opacity="0.14" filter="url(#simple-leaf-blur)" />
      <!-- Back leaves, radiating outwards from the centre base -->
      ${mintLeaf(cx - 268, 1262, -42, 1.28, 0.9)}
      ${mintLeaf(cx - 190, 1252, -58, 1.02, 0.8)}
      ${mintLeaf(cx - 372, 1268, -24, 0.92, 0.78)}
      ${mintLeaf(cx + 268, 1262, 42, 1.28, 0.9)}
      ${mintLeaf(cx + 190, 1252, 58, 1.02, 0.8)}
      ${mintLeaf(cx + 372, 1268, 24, 0.92, 0.78)}
      <!-- Inner leaves hugging the product base -->
      ${mintLeaf(cx - 96, 1248, -14, 0.82, 0.86)}
      ${mintLeaf(cx + 96, 1248, 14, 0.82, 0.86)}
      ${mintLeaf(cx - 44, 1242, -5, 0.62, 0.9)}
      ${mintLeaf(cx + 44, 1242, 5, 0.62, 0.9)}
      <!-- Foreground tips spilling onto the glossy floor -->
      <g opacity="0.9">
        ${mintLeaf(cx - 300, 1336, -118, 0.7, 0.7)}
        ${mintLeaf(cx + 300, 1336, 118, 0.7, 0.7)}
      </g>
    </g>
  `.trim();
}

function simpleBotanicalHorizon(
  width: number,
  height: number,
  paletteKey: SimplePaletteKey,
): string {
  const palette = SIMPLE_PALETTES[paletteKey] ?? SIMPLE_PALETTES["fresh-sage"];
  const horizon = SIMPLE_HORIZON_Y;
  const floorHeight = Math.max(1, height - horizon);
  return `
    <g id="simple-botanical-horizon" data-theme="simple" data-palette="${palette.key}" data-horizon-y="${horizon}">
      ${simpleDefs(palette)}
      <!-- Colour-matched monochrome studio wall -->
      <rect x="0" y="0" width="${width}" height="${horizon}" fill="url(#simple-wall)" />
      <rect x="0" y="0" width="${width}" height="${horizon}" fill="url(#simple-sky-glow)" />
      <!-- Two soft volumetric clouds in the open upper sky -->
      <g id="cloud-left">${cumulusCloud(185, 492, 0.92, 0.9)}</g>
      <g id="cloud-right">${cumulusCloud(896, 560, 0.98, 0.86)}</g>
      <!-- Glossy reflective floor -->
      <rect x="0" y="${horizon}" width="${width}" height="${floorHeight}" fill="url(#simple-floor)" />
      <rect x="0" y="${horizon}" width="${width}" height="${Math.round(floorHeight * 0.6)}" fill="url(#simple-floor-sheen)" />
      <ellipse cx="${width / 2}" cy="${horizon}" rx="660" ry="128" fill="url(#simple-horizon-glow)" />
      <!-- Crisp glossy horizon line -->
      <rect id="horizon-line" x="0" y="${horizon - 1}" width="${width}" height="3" fill="#FFFFFF" fill-opacity="0.55" />
      <rect x="0" y="${horizon + 2}" width="${width}" height="10" fill="#FFFFFF" fill-opacity="0.08" />
      ${botanicalBase(width)}
    </g>
  `.trim();
}

export function deterministicSceneMarkup(
  template: DesignerTemplate,
  width: number,
  height: number,
  palette: SimplePaletteKey = "fresh-sage",
): string {
  switch (template) {
    case "simple-botanical-horizon":
      return simpleBotanicalHorizon(width, height, palette);
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
  const palette = request.palette ?? "fresh-sage";
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
    markup: deterministicSceneMarkup(template, width, height, palette),
    fallbackReason: sceneImageUrl ? "non-data scene URL not embeddable; rendered inline vector studio fallback" : undefined,
  };
}

export function templateForVariant(
  variantNumber: 1 | 2,
  seed: string,
): DesignerTemplate {
  // Variant 1 is always the approved Simple editorial theme (primary default);
  // variant 2 rotates the secondary variations so pairs never look identical.
  if (variantNumber === 1) return "simple-botanical-horizon";
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 2 === 0
    ? "botanical-arch-frame"
    : "editorial-beauty-card";
}
