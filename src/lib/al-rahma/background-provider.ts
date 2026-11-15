import { escapeXml } from "./svg-utils";

/**
 * Background/scene layer for the ad composer.
 *
 * Scenes are pure studio stages (no text, no bottles/products). The real
 * packshot is composited separately by the overlay system.
 *
 * Default behavior is a high-craft deterministic SVG photorealistic studio
 * shader fallback (lighting, 3D podium, bokeh, botanical shadows) so offline
 * renders still look like a studio. When an AI scene image is provided
 * (embedded data URI or URL), it is used as the photographic stage.
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
      <radialGradient id="studio-light-core" cx="50%" cy="22%" r="55%">
        <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.95" />
        <stop offset="45%" stop-color="#F8FAFC" stop-opacity="0.55" />
        <stop offset="100%" stop-color="#E2E8F0" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="studio-light-floor" cx="50%" cy="78%" r="60%">
        <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.55" />
        <stop offset="60%" stop-color="#E2E8F0" stop-opacity="0.15" />
        <stop offset="100%" stop-color="#94A3B8" stop-opacity="0" />
      </radialGradient>
      <linearGradient id="podium-surface" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#FFFFFF" />
        <stop offset="55%" stop-color="#F1F5F9" />
        <stop offset="100%" stop-color="#CBD5E1" />
      </linearGradient>
      <linearGradient id="podium-front" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#E2E8F0" />
        <stop offset="35%" stop-color="#CBD5E1" />
        <stop offset="100%" stop-color="#94A3B8" />
      </linearGradient>
      <linearGradient id="podium-edge" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.85" />
        <stop offset="40%" stop-color="#E2E8F0" stop-opacity="0.6" />
        <stop offset="100%" stop-color="#94A3B8" stop-opacity="0.5" />
      </linearGradient>
      <filter id="bokeh-blur" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="18" />
      </filter>
      <filter id="leaf-shadow-blur" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="8" />
      </filter>
      <filter id="soft-scene-shadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="14" stdDeviation="14" flood-color="#0F172A" flood-opacity="0.16" />
      </filter>
    </defs>
  `.trim();
}

function bokehLights(points: Array<[number, number, number, string, number]>): string {
  return points
    .map(
      ([x, y, r, color, opacity]) =>
        `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" fill-opacity="${opacity}" filter="url(#bokeh-blur)" />`,
    )
    .join("\n");
}

function podium3D(cx: number): string {
  const topY = 1285;
  const bottomY = 1400;
  const topW = 760;
  const bottomW = 620;
  const x1 = cx - topW / 2;
  const x2 = cx + topW / 2;
  const x3 = cx + bottomW / 2;
  const x4 = cx - bottomW / 2;
  return `
    <g id="shader-podium" filter="url(#soft-scene-shadow)">
      <ellipse cx="${cx}" cy="${bottomY + 28}" rx="420" ry="52" fill="#0F172A" fill-opacity="0.16" />
      <path d="M ${x1} ${topY} L ${x2} ${topY} L ${x3} ${bottomY} L ${x4} ${bottomY} Z" fill="url(#podium-front)" />
      <ellipse cx="${cx}" cy="${topY}" rx="${topW / 2}" ry="34" fill="url(#podium-surface)" />
      <ellipse cx="${cx}" cy="${topY - 2}" rx="${topW / 2 - 12}" ry="24" fill="#FFFFFF" fill-opacity="0.55" />
      <ellipse cx="${cx}" cy="${topY + 2}" rx="${topW / 2 - 30}" ry="14" fill="#FFFFFF" fill-opacity="0.22" />
      <path d="M ${x1 + 8} ${topY + 6} L ${x2 - 8} ${topY + 6}" stroke="url(#podium-edge)" stroke-width="3" stroke-opacity="0.8" />
      <path d="M ${x4 + 20} ${bottomY - 10} L ${x3 - 20} ${bottomY - 10}" stroke="#94A3B8" stroke-opacity="0.25" stroke-width="2" />
    </g>
  `;
}

function botanicalShadows(width: number): string {
  return `
    <g id="botanical-shadows" opacity="0.55">
      <g filter="url(#leaf-shadow-blur)" fill="#14532D">
        <ellipse cx="90" cy="1220" rx="160" ry="70" transform="rotate(-18 90 1220)" fill-opacity="0.14" />
        <ellipse cx="${width - 90}" cy="1210" rx="170" ry="74" transform="rotate(18 ${width - 90} 1210)" fill-opacity="0.14" />
        <ellipse cx="120" cy="980" rx="120" ry="48" transform="rotate(-28 120 980)" fill-opacity="0.10" />
        <ellipse cx="${width - 120}" cy="990" rx="120" ry="48" transform="rotate(28 ${width - 120} 990)" fill-opacity="0.10" />
      </g>
      <g fill="#166534">
        <path d="M-20 1180 C 80 1030, 170 980, 240 1030 C 150 1080, 90 1140, 40 1260 Z" fill-opacity="0.22" />
        <path d="M0 1260 C 70 1110, 150 1050, 220 1080 C 150 1140, 90 1200, 40 1320 Z" fill-opacity="0.18" />
        <path d="M${width + 20} 1180 C ${width - 80} 1030, ${width - 170} 980, ${width - 240} 1030 C ${width - 150} 1080, ${width - 90} 1140, ${width - 40} 1260 Z" fill-opacity="0.22" />
        <path d="M${width} 1260 C ${width - 70} 1110, ${width - 150} 1050, ${width - 220} 1080 C ${width - 150} 1140, ${width - 90} 1200, ${width - 40} 1320 Z" fill-opacity="0.18" />
      </g>
    </g>
  `;
}

function silverPodiumBotanical(width: number, height: number): string {
  const cx = width / 2;
  return `
    ${sharedDefs()}
    <rect width="${width}" height="${height}" fill="#E8EDF2" />
    <rect width="${width}" height="${height}" fill="url(#studio-light-core)" />
    <rect width="${width}" height="${height}" fill="url(#studio-light-floor)" />
    ${bokehLights([
      [140, 260, 70, "#FFFFFF", 0.18],
      [920, 320, 90, "#FFFFFF", 0.14],
      [860, 560, 55, "#E2E8F0", 0.18],
      [220, 600, 48, "#E2E8F0", 0.16],
      [540, 220, 40, "#FFFFFF", 0.12],
    ])}
    ${botanicalShadows(width)}
    ${podium3D(cx)}
    <ellipse cx="${cx}" cy="1220" rx="280" ry="22" fill="#FFFFFF" fill-opacity="0.22" />
  `.trim();
}

function botanicalArchFrame(width: number, height: number): string {
  const cx = width / 2;
  const splitY = Math.round(height * 0.56);
  const archW = 760;
  const archH = 980;
  const archX = (width - archW) / 2;
  const archY = 300;
  const r = archW / 2;
  return `
    ${sharedDefs()}
    <rect width="${width}" height="${splitY}" fill="#F4EBDD" />
    <rect y="${splitY}" width="${width}" height="${height - splitY}" fill="#D7E6D2" />
    <rect width="${width}" height="${height}" fill="url(#studio-light-core)" opacity="0.9" />
    <rect width="${width}" height="${height}" fill="url(#studio-light-floor)" opacity="0.8" />
    ${bokehLights([
      [180, 280, 60, "#FFFFFF", 0.12],
      [900, 300, 70, "#FFF7ED", 0.10],
      [540, 240, 50, "#FFFFFF", 0.10],
    ])}
    <g id="arch-scene">
      <path d="M ${archX} ${archY + archH} L ${archX} ${archY + r} A ${r} ${r} 0 0 1 ${archX + archW} ${archY + r} L ${archX + archW} ${archY + archH} Z" fill="#FFFFFF" fill-opacity="0.22" stroke="#FFFFFF" stroke-opacity="0.4" stroke-width="2" />
      <path d="M ${archX + 30} ${archY + archH - 8} L ${archX + 30} ${archY + r + 10} A ${r - 30} ${r - 30} 0 0 1 ${archX + archW - 30} ${archY + r + 10} L ${archX + archW - 30} ${archY + archH - 8} Z" fill="none" stroke="#D97706" stroke-opacity="0.22" stroke-width="2" />
    </g>
    ${botanicalShadows(width)}
    ${podium3D(cx)}
  `.trim();
}

function editorialBeautyCard(width: number, height: number): string {
  const cx = width / 2;
  return `
    ${sharedDefs()}
    <rect width="${width}" height="${height}" fill="#F7F2EA" />
    <rect width="${width}" height="${height}" fill="url(#studio-light-core)" />
    <rect width="${width}" height="${height}" fill="url(#studio-light-floor)" opacity="0.8" />
    ${bokehLights([
      [160, 300, 55, "#FFFFFF", 0.14],
      [920, 340, 65, "#E2E8F0", 0.12],
      [540, 210, 45, "#FFFFFF", 0.10],
    ])}
    <g opacity="0.22" stroke="#94A3B8" fill="none">
      <path d="M90 240 C 170 150, 250 150, 330 240" />
      <path d="M750 280 C 830 190, 910 190, 990 280" />
      <circle cx="180" cy="520" r="22" />
      <circle cx="900" cy="560" r="18" />
    </g>
    <rect x="120" y="360" width="${width - 240}" height="980" rx="40" fill="#FFFFFF" fill-opacity="0.20" stroke="#E2E8F0" stroke-opacity="0.5" />
    ${botanicalShadows(width)}
    ${podium3D(cx)}
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

  if (sceneImageUrl) {
    const provider: BackgroundProviderId =
      sceneImageUrl.includes("image.pollinations.ai") ? "pollinations" : "cloudflare-ai";
    return {
      provider,
      requestedProvider: provider,
      kind: "image",
      template,
      markup: `
        <image href="${escapeXml(sceneImageUrl)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" />
        <rect width="${width}" height="${height}" fill="#FFFFFF" fill-opacity="0.04" />
      `.trim(),
    };
  }

  return {
    provider: "deterministic-studio",
    requestedProvider: "deterministic-studio",
    kind: "scene",
    template,
    markup: deterministicSceneMarkup(template, width, height),
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
