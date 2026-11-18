import { escapeXml } from "./svg-utils";

/**
 * Background/scene layer for the ad composer.
 *
 * Scenes are pure edge-to-edge studio stages (no text, no bottles/products, no
 * podium). The authentic packshot is composited as a full-bleed hero by the
 * overlay system, so backgrounds must blend seamlessly across the full
 * 1080x1920 canvas while preserving authentic packaging colors at 100% vibrancy.
 *
 * Default behavior is a deterministic SVG editorial fallback. When an AI scene
 * image is provided (embedded data URI), it is used as the photographic stage.
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
 * Adaptive colour palettes for the Botanical Horizon Reflection theme. The
 * studio wall and glossy floor are colour-matched to the product packaging mood
 * so the same composition works for skincare, haircare and luxury fragrance.
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
 * Deterministically pick the Botanical Horizon palette from product
 * category/brand/name so the monochrome wall/floor/mint cluster complements the
 * authentic packaging.
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
  if (/(kids|children|child|أطفال|اطفال|مينك|mink|baby|بيبي)/.test(haystack)) {
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
  /** Botanical Horizon colour mood; defaults to fresh sage-green. */
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

/** Deterministic fallback: Coastal Sunlit Stone & Caustics. */
function coastalSunlitStone(width: number, height: number): string {
  return `
    <defs>
      <linearGradient id="coastal-sky" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#E8F4FF" />
        <stop offset="35%" stop-color="#F6EFE2" />
        <stop offset="100%" stop-color="#E7D3B5" />
      </linearGradient>
      <linearGradient id="coastal-stone" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#F3E3C8" />
        <stop offset="55%" stop-color="#E2C79F" />
        <stop offset="100%" stop-color="#C9A777" />
      </linearGradient>
      <radialGradient id="coastal-sun" cx="62%" cy="22%" r="55%">
        <stop offset="0%" stop-color="#FFF7D6" stop-opacity="0.95" />
        <stop offset="45%" stop-color="#FFDFA3" stop-opacity="0.35" />
        <stop offset="100%" stop-color="#FFDFA3" stop-opacity="0" />
      </radialGradient>
      <filter id="coastal-bokeh" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="22" />
      </filter>
      <filter id="coastal-caustic" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="10" />
      </filter>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#coastal-sky)" />
    <rect x="0" y="${Math.round(height * 0.55)}" width="${width}" height="${Math.round(height * 0.45)}" fill="url(#coastal-stone)" />
    <rect width="${width}" height="${height}" fill="url(#coastal-sun)" />
    <g id="coastal-ocean-bokeh" filter="url(#coastal-bokeh)" opacity="0.35">
      <circle cx="180" cy="420" r="140" fill="#7DD3FC" />
      <circle cx="920" cy="360" r="160" fill="#BAE6FD" />
      <circle cx="540" cy="520" r="180" fill="#E0F2FE" />
    </g>
    <g id="coastal-caustics" filter="url(#coastal-caustic)" opacity="0.28">
      <ellipse cx="420" cy="1320" rx="220" ry="70" fill="#FFF3C4" />
      <ellipse cx="700" cy="1380" rx="260" ry="80" fill="#FFE8A3" />
      <ellipse cx="560" cy="1500" rx="320" ry="90" fill="#FFF7D6" />
    </g>
  `.trim();
}

/** Deterministic fallback: Noir Basalt & Golden Rim-Light. */
function noirBasaltGolden(width: number, height: number): string {
  return `
    <defs>
      <linearGradient id="noir-wall" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#0B0F14" />
        <stop offset="55%" stop-color="#111827" />
        <stop offset="100%" stop-color="#0F172A" />
      </linearGradient>
      <linearGradient id="noir-slab" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#1F2937" />
        <stop offset="100%" stop-color="#0B1220" />
      </linearGradient>
      <radialGradient id="noir-amber" cx="55%" cy="42%" r="60%">
        <stop offset="0%" stop-color="#FDE68A" stop-opacity="0.22" />
        <stop offset="35%" stop-color="#F59E0B" stop-opacity="0.16" />
        <stop offset="100%" stop-color="#F59E0B" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="noir-mist" cx="50%" cy="70%" r="60%">
        <stop offset="0%" stop-color="#F8FAFC" stop-opacity="0.10" />
        <stop offset="100%" stop-color="#F8FAFC" stop-opacity="0" />
      </radialGradient>
      <filter id="noir-glow" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="26" />
      </filter>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#noir-wall)" />
    <rect x="0" y="${Math.round(height * 0.58)}" width="${width}" height="${Math.round(height * 0.42)}" fill="url(#noir-slab)" />
    <ellipse cx="${Math.round(width * 0.56)}" cy="${Math.round(height * 0.44)}" rx="520" ry="420" fill="url(#noir-amber)" filter="url(#noir-glow)" />
    <rect width="${width}" height="${height}" fill="url(#noir-mist)" />
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

/* botanical-arch-frame maps to Coastal Sunlit Stone & Caustics */
/* editorial-beauty-card maps to Noir Basalt & Golden Rim-Light */

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

function cumulusCloud(cx: number, cy: number, scale: number, opacity: number): string {
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

function mintLeaf(x: number, y: number, rotate: number, scale: number, opacity: number): string {
  return `
    <g transform="translate(${x} ${y}) rotate(${rotate}) scale(${scale})">
      <path d="M 0 0 C -34 -34, -42 -104, 0 -152 C 42 -104, 34 -34, 0 0 Z" fill="url(#simple-leaf)" fill-opacity="${opacity}" />
      <path d="M 0 -8 L 0 -138" stroke="#FFFFFF" stroke-opacity="0.18" stroke-width="2" fill="none" />
      <path d="M 0 -42 C -16 -58, -22 -74, -24 -92 M 0 -42 C 16 -58, 22 -74, 24 -92 M 0 -82 C -12 -94, -16 -104, -18 -116 M 0 -82 C 12 -94, 16 -104, 18 -116" stroke="#0B1B16" stroke-opacity="0.22" stroke-width="1.6" fill="none" />
    </g>
  `.trim();
}

function botanicalBase(width: number): string {
  const cx = width / 2;
  return `
    <g id="botanical-base">
      <ellipse cx="${cx}" cy="1258" rx="430" ry="54" fill="#0B1B16" fill-opacity="0.14" filter="url(#simple-leaf-blur)" />
      ${mintLeaf(cx - 268, 1262, -42, 1.28, 0.9)}
      ${mintLeaf(cx - 190, 1252, -58, 1.02, 0.8)}
      ${mintLeaf(cx - 372, 1268, -24, 0.92, 0.78)}
      ${mintLeaf(cx + 268, 1262, 42, 1.28, 0.9)}
      ${mintLeaf(cx + 190, 1252, 58, 1.02, 0.8)}
      ${mintLeaf(cx + 372, 1268, 24, 0.92, 0.78)}
      ${mintLeaf(cx - 96, 1248, -14, 0.82, 0.86)}
      ${mintLeaf(cx + 96, 1248, 14, 0.82, 0.86)}
      ${mintLeaf(cx - 44, 1242, -5, 0.62, 0.9)}
      ${mintLeaf(cx + 44, 1242, 5, 0.62, 0.9)}
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
      <rect x="0" y="0" width="${width}" height="${horizon}" fill="url(#simple-wall)" />
      <rect x="0" y="0" width="${width}" height="${horizon}" fill="url(#simple-sky-glow)" />
      <g id="cloud-left">${cumulusCloud(185, 492, 0.92, 0.9)}</g>
      <g id="cloud-right">${cumulusCloud(896, 560, 0.98, 0.86)}</g>
      <rect x="0" y="${horizon}" width="${width}" height="${floorHeight}" fill="url(#simple-floor)" />
      <rect x="0" y="${horizon}" width="${width}" height="${Math.round(floorHeight * 0.6)}" fill="url(#simple-floor-sheen)" />
      <ellipse cx="${width / 2}" cy="${horizon}" rx="660" ry="128" fill="url(#simple-horizon-glow)" />
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
      return coastalSunlitStone(width, height);
    case "editorial-beauty-card":
      return noirBasaltGolden(width, height);
    case "silver-podium-botanical":
    default:
      return silverPodiumBotanical(width, height);
  }
}

export function resolveBackground(request: BackgroundRequest): BackgroundLayer {
  const { width, height, template } = request;
  const palette = request.palette ?? "fresh-sage";
  const sceneImageUrl = request.sceneImageUrl?.trim() || null;

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
  // Rotate cleanly across the 3 luxury art styles (Coastal Sunlit Stone &
  // Caustics, Botanical Horizon Reflection, Noir Basalt & Golden Rim-Light).
  // Pairs are deterministic per seed and always distinct.
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const base = Math.abs(hash);
  const order: DesignerTemplate[] = [
    "botanical-arch-frame", // Coastal Sunlit Stone & Caustics
    "simple-botanical-horizon", // Botanical Horizon Reflection
    "editorial-beauty-card", // Noir Basalt & Golden Rim-Light
  ];
  const first = order[base % order.length];
  if (variantNumber === 1) return first;
  const second = order[(base + 1) % order.length];
  return second === first ? order[(base + 2) % order.length] : second;
}
