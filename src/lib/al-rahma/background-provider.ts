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
      <linearGradient id="studio-wall" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#F8FAFC" />
        <stop offset="35%" stop-color="#EEF2F6" />
        <stop offset="70%" stop-color="#E2E8F0" />
        <stop offset="100%" stop-color="#D7DEE7" />
      </linearGradient>
      <linearGradient id="studio-wall-sheen" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.55" />
        <stop offset="45%" stop-color="#CBD5E1" stop-opacity="0.08" />
        <stop offset="100%" stop-color="#94A3B8" stop-opacity="0.12" />
      </linearGradient>
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
      <linearGradient id="marble-vein" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#94A3B8" stop-opacity="0.00" />
        <stop offset="45%" stop-color="#94A3B8" stop-opacity="0.10" />
        <stop offset="55%" stop-color="#CBD5E1" stop-opacity="0.08" />
        <stop offset="100%" stop-color="#94A3B8" stop-opacity="0.00" />
      </linearGradient>
      <radialGradient id="pearl" cx="35%" cy="30%" r="70%">
        <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.98" />
        <stop offset="45%" stop-color="#F1F5F9" stop-opacity="0.95" />
        <stop offset="100%" stop-color="#CBD5E1" stop-opacity="0.92" />
      </radialGradient>
      <filter id="bokeh-blur" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="18" />
      </filter>
      <filter id="leaf-shadow-blur" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="8" />
      </filter>
      <filter id="soft-scene-shadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="14" stdDeviation="14" flood-color="#0F172A" flood-opacity="0.16" />
      </filter>
      <filter id="pearl-glow" x="-60%" y="-60%" width="220%" height="220%">
        <feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#FFFFFF" flood-opacity="0.35" />
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

function pearlSpheres(width: number): string {
  const pearls: Array<[number, number, number, number]> = [
    [150, 560, 18, 0.55],
    [220, 420, 12, 0.42],
    [width - 170, 520, 16, 0.50],
    [width - 240, 380, 10, 0.38],
    [width / 2 + 210, 640, 9, 0.32],
  ];
  return `
    <g id="pearl-spheres" filter="url(#pearl-glow)">
      ${pearls
        .map(
          ([cx, cy, r, o]) => `
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#pearl)" fill-opacity="${o}" />
            <ellipse cx="${cx - r * 0.28}" cy="${cy - r * 0.28}" rx="${r * 0.28}" ry="${r * 0.18}" fill="#FFFFFF" fill-opacity="${Math.min(0.8, o + 0.15)}" />
          `,
        )
        .join("")}
    </g>
  `;
}

function hexPoints(cx: number, cy: number, rx: number, ry: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    const a = (Math.PI / 180) * (60 * i - 30);
    pts.push(`${(cx + rx * Math.cos(a)).toFixed(2)},${(cy + ry * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
}

function podium3D(cx: number): string {
  // 3D white marble + brushed silver hexagonal podium, top surface aligned near y=1200 (packshot bottom ~1230)
  const topY = 1200;
  const bottomY = 1284;
  const rxTop = 360;
  const ryTop = 58;
  const rxBot = 300;
  const ryBot = 48;
  const topPts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return [cx + rxTop * Math.cos(a), topY + ryTop * Math.sin(a)] as [number, number];
  });
  const botPts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return [cx + rxBot * Math.cos(a), bottomY + ryBot * Math.sin(a)] as [number, number];
  });
  const sides = [0, 1, 2].map((i) => {
    const j = (i + 1) % 6;
    return `<polygon points="${topPts[i][0]},${topPts[i][1]} ${topPts[j][0]},${topPts[j][1]} ${botPts[j][0]},${botPts[j][1]} ${botPts[i][0]},${botPts[i][1]}" fill="url(#podium-front)" stroke="#94A3B8" stroke-opacity="0.18" />`;
  });

  return `
    <g id="shader-podium" filter="url(#soft-scene-shadow)">
      <ellipse cx="${cx}" cy="${bottomY + 40}" rx="430" ry="56" fill="#0F172A" fill-opacity="0.12" />
      ${sides.join("")}
      <polygon points="${hexPoints(cx, topY, rxTop, ryTop)}" fill="url(#podium-surface)" stroke="url(#podium-edge)" stroke-width="2" />
      <polygon points="${hexPoints(cx, topY - 1, rxTop * 0.84, ryTop * 0.74)}" fill="#FFFFFF" fill-opacity="0.34" />
      <polygon points="${hexPoints(cx, topY, rxTop, ryTop)}" fill="url(#marble-vein)" fill-opacity="0.55" />
      <path d="M ${cx - 220} ${topY - 8} C ${cx - 80} ${topY - 18}, ${cx + 40} ${topY + 16}, ${cx + 210} ${topY + 2}" stroke="#CBD5E1" stroke-opacity="0.55" stroke-width="2" fill="none" />
      <path d="M ${cx - 160} ${topY + 10} C ${cx - 40} ${topY}, ${cx + 70} ${topY + 22}, ${cx + 170} ${topY + 12}" stroke="#E2E8F0" stroke-opacity="0.7" stroke-width="1.5" fill="none" />
      <ellipse cx="${cx}" cy="${topY + 2}" rx="${rxTop * 0.92}" ry="${ryTop * 0.55}" fill="#FFFFFF" fill-opacity="0.10" />
    </g>
  `;
}

function botanicalShadows(width: number): string {
  return `
    <g id="botanical-shadows" opacity="0.65">
      <g filter="url(#leaf-shadow-blur)" fill="#334155">
        <path d="M 40 520 C 220 420, 360 460, 420 620 C 300 640, 180 640, 40 520 Z" fill-opacity="0.10" />
        <path d="M ${width - 40} 540 C ${width - 220} 430, ${width - 360} 470, ${width - 430} 640 C ${width - 300} 660, ${width - 180} 650, ${width - 40} 540 Z" fill-opacity="0.10" />
        <ellipse cx="120" cy="980" rx="150" ry="52" transform="rotate(-22 120 980)" fill-opacity="0.08" />
        <ellipse cx="${width - 120}" cy="990" rx="150" ry="52" transform="rotate(22 ${width - 120} 990)" fill-opacity="0.08" />
        <ellipse cx="90" cy="1220" rx="160" ry="70" transform="rotate(-18 90 1220)" fill-opacity="0.10" />
        <ellipse cx="${width - 90}" cy="1210" rx="170" ry="74" transform="rotate(18 ${width - 90} 1210)" fill-opacity="0.10" />
      </g>
      <g id="corner-foliage">
        <g transform="translate(0, ${Math.max(0, 1920 - 520)})">
          <path d="M-30 520 C 90 360, 220 300, 320 340 C 220 380, 150 450, 90 540 Z" fill="#166534" fill-opacity="0.30" />
          <path d="M-10 560 C 80 420, 180 350, 270 390 C 190 430, 120 500, 60 600 Z" fill="#15803D" fill-opacity="0.24" />
          <path d="M40 600 C 120 470, 210 430, 280 470 C 220 500, 160 560, 120 640 Z" fill="#14532D" fill-opacity="0.22" />
          <path d="M-40 380 C 60 260, 170 220, 250 280 C 170 300, 90 360, 10 470 Z" fill="#166534" fill-opacity="0.18" />
        </g>
        <g transform="translate(${width}, ${Math.max(0, 1920 - 520)}) scale(-1,1)">
          <path d="M-30 520 C 90 360, 220 300, 320 340 C 220 380, 150 450, 90 540 Z" fill="#166534" fill-opacity="0.30" />
          <path d="M-10 560 C 80 420, 180 350, 270 390 C 190 430, 120 500, 60 600 Z" fill="#15803D" fill-opacity="0.24" />
          <path d="M40 600 C 120 470, 210 430, 280 470 C 220 500, 160 560, 120 640 Z" fill="#14532D" fill-opacity="0.22" />
          <path d="M-40 380 C 60 260, 170 220, 250 280 C 170 300, 90 360, 10 470 Z" fill="#166534" fill-opacity="0.18" />
        </g>
      </g>
    </g>
  `;
}

function wallBackdrop(width: number, height: number): string {
  return `
    <rect width="${width}" height="${height}" fill="url(#studio-wall)" />
    <rect width="${width}" height="${height}" fill="url(#studio-wall-sheen)" />
    <rect width="${width}" height="${height}" fill="url(#studio-light-core)" />
    <rect width="${width}" height="${height}" fill="url(#studio-light-floor)" />
  `;
}

function silverPodiumBotanical(width: number, height: number): string {
  const cx = width / 2;
  return `
    ${sharedDefs()}
    ${wallBackdrop(width, height)}
    ${bokehLights([
      [140, 260, 70, "#FFFFFF", 0.16],
      [920, 320, 90, "#FFFFFF", 0.13],
      [860, 560, 55, "#E2E8F0", 0.16],
      [220, 600, 48, "#E2E8F0", 0.14],
      [540, 220, 40, "#FFFFFF", 0.10],
    ])}
    ${pearlSpheres(width)}
    ${botanicalShadows(width)}
    ${podium3D(cx)}
    <ellipse cx="${cx}" cy="1170" rx="280" ry="22" fill="#FFFFFF" fill-opacity="0.14" />
  `.trim();
}

function botanicalArchFrame(width: number, height: number): string {
  const cx = width / 2;
  const archW = 760;
  const archH = 980;
  const archX = (width - archW) / 2;
  const archY = 300;
  const r = archW / 2;
  return `
    ${sharedDefs()}
    ${wallBackdrop(width, height)}
    ${bokehLights([
      [180, 280, 60, "#FFFFFF", 0.12],
      [900, 300, 70, "#FFF7ED", 0.10],
      [540, 240, 50, "#FFFFFF", 0.10],
    ])}
    <g id="arch-scene" opacity="0.95">
      <path d="M ${archX} ${archY + archH} L ${archX} ${archY + r} A ${r} ${r} 0 0 1 ${archX + archW} ${archY + r} L ${archX + archW} ${archY + archH} Z" fill="#FFFFFF" fill-opacity="0.16" stroke="#FFFFFF" stroke-opacity="0.35" stroke-width="2" />
      <path d="M ${archX + 30} ${archY + archH - 8} L ${archX + 30} ${archY + r + 10} A ${r - 30} ${r - 30} 0 0 1 ${archX + archW - 30} ${archY + r + 10} L ${archX + archW - 30} ${archY + archH - 8} Z" fill="none" stroke="#D97706" stroke-opacity="0.18" stroke-width="2" />
    </g>
    ${pearlSpheres(width)}
    ${botanicalShadows(width)}
    ${podium3D(cx)}
  `.trim();
}

function editorialBeautyCard(width: number, height: number): string {
  const cx = width / 2;
  return `
    ${sharedDefs()}
    ${wallBackdrop(width, height)}
    ${bokehLights([
      [160, 300, 55, "#FFFFFF", 0.14],
      [920, 340, 65, "#E2E8F0", 0.12],
      [540, 210, 45, "#FFFFFF", 0.10],
    ])}
    <rect x="120" y="360" width="${width - 240}" height="980" rx="40" fill="#FFFFFF" fill-opacity="0.18" stroke="#E2E8F0" stroke-opacity="0.45" />
    ${pearlSpheres(width)}
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
