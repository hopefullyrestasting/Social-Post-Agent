import { escapeXml } from "./svg-utils";

/**
 * Background/scene layer for the ad composer.
 *
 * Scenes are pure studio stages (no text, no bottles/products). The real
 * packshot is composited separately by the overlay system.
 *
 * Default behavior is deterministic SVG scenes per template. When an AI scene
 * image is provided (data URI or URL from /api/ai/studio-scene), it is embedded
 * as the photographic stage and deterministic scene accents can still be layered.
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

function sceneDefs(): string {
  return `
    <defs>
      <linearGradient id="scene-silver" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#E2E8F0" />
        <stop offset="55%" stop-color="#F1F5F9" />
        <stop offset="100%" stop-color="#F8FAFC" />
      </linearGradient>
      <radialGradient id="scene-pearl" cx="35%" cy="35%" r="65%">
        <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.95" />
        <stop offset="55%" stop-color="#E2E8F0" stop-opacity="0.95" />
        <stop offset="100%" stop-color="#94A3B8" stop-opacity="0.55" />
      </radialGradient>
      <linearGradient id="podium-top" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#FFFFFF" />
        <stop offset="100%" stop-color="#CBD5E1" />
      </linearGradient>
      <linearGradient id="podium-side" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#E2E8F0" />
        <stop offset="100%" stop-color="#94A3B8" />
      </linearGradient>
      <filter id="soft-shadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="18" stdDeviation="16" flood-color="#0F172A" flood-opacity="0.18" />
      </filter>
    </defs>
  `.trim();
}

function pearl(x: number, y: number, r: number, opacity = 0.85): string {
  return `
    <g opacity="${opacity}">
      <circle cx="${x}" cy="${y}" r="${r}" fill="url(#scene-pearl)" filter="url(#soft-shadow)" />
      <ellipse cx="${x - r * 0.28}" cy="${y - r * 0.28}" rx="${r * 0.22}" ry="${r * 0.14}" fill="#FFFFFF" fill-opacity="0.7" />
    </g>
  `;
}

function hexPodium(width: number, height: number): string {
  const cx = width / 2;
  const y = Math.round(height * 0.74);
  const w1 = 420;
  const w2 = 320;
  const w3 = 220;
  const h = 54;
  const side = 26;
  const hex = (wy: number, ww: number, fill: string, stroke = "#CBD5E1") => {
    const x1 = cx - ww / 2;
    const x2 = cx + ww / 2;
    return `
      <g>
        <polygon points="${x1},${wy} ${x2},${wy} ${x2 - 40},${wy + h} ${x1 + 40},${wy + h}" fill="${fill}" stroke="${stroke}" stroke-opacity="0.5" />
        <polygon points="${x1},${wy} ${x1 + 40},${wy + h} ${x1 + 40},${wy + h + side} ${x1},${wy + side}" fill="url(#podium-side)" opacity="0.55" />
        <polygon points="${x2},${wy} ${x2},${wy + side} ${x2 - 40},${wy + h + side} ${x2 - 40},${wy + h}" fill="url(#podium-side)" opacity="0.35" />
      </g>
    `;
  };
  return `
    <g id="hex-podium" filter="url(#soft-shadow)">
      <ellipse cx="${cx}" cy="${y + h * 3 + 28}" rx="360" ry="44" fill="#0F172A" fill-opacity="0.10" />
      ${hex(y, w1, "url(#podium-top)")}
      ${hex(y - h - 10, w2, "url(#podium-top)", "#E2E8F0")}
      ${hex(y - (h + 10) * 2, w3, "#FFFFFF", "#E2E8F0")}
    </g>
  `;
}

function palmLeaf(x: number, y: number, scale: number, rotate: number, flip = false): string {
  const sx = flip ? -scale : scale;
  return `
    <g transform="translate(${x},${y}) rotate(${rotate}) scale(${sx},${scale})" opacity="0.9">
      <path d="M0 0 C 40 -120 120 -180 220 -160 C 140 -120 80 -60 40 20 Z" fill="#166534" fill-opacity="0.22" />
      <path d="M0 0 C 20 -140 90 -220 200 -240 C 140 -170 70 -90 20 10 Z" fill="#15803D" fill-opacity="0.18" />
      <path d="M0 0 C 70 -80 160 -100 240 -60 C 150 -50 70 -10 20 30 Z" fill="#14532D" fill-opacity="0.16" />
      <path d="M0 0 C 10 120 20 240 10 360" stroke="#14532D" stroke-width="6" stroke-opacity="0.18" fill="none" />
    </g>
  `;
}

function silverPodiumBotanical(width: number, height: number): string {
  return `
    ${sceneDefs()}
    <rect width="${width}" height="${height}" fill="url(#scene-silver)" />
    ${pearl(160, 260, 64, 0.55)}
    ${pearl(920, 320, 92, 0.5)}
    ${pearl(860, 620, 46, 0.45)}
    ${pearl(210, 620, 38, 0.4)}
    ${pearl(540, 240, 28, 0.35)}
    ${palmLeaf(40, height * 0.62, 1.05, -8, false)}
    ${palmLeaf(width - 40, height * 0.62, 1.05, 8, true)}
    ${hexPodium(width, height)}
  `.trim();
}

function botanicalArchFrame(width: number, height: number): string {
  const splitY = Math.round(height * 0.58);
  const archW = 720;
  const archH = 980;
  const archX = (width - archW) / 2;
  const archY = 320;
  const r = archW / 2;
  const star = (x: number, y: number, s: number) => `
    <g transform="translate(${x},${y})" fill="#D97706" fill-opacity="0.85">
      <path d="M0 ${-s} L${s * 0.22} ${-s * 0.22} L${s} 0 L${s * 0.22} ${s * 0.22} L0 ${s} L${-s * 0.22} ${s * 0.22} L${-s} 0 L${-s * 0.22} ${-s * 0.22} Z" />
    </g>
  `;
  return `
    ${sceneDefs()}
    <rect width="${width}" height="${splitY}" fill="#F7F1E6" />
    <rect y="${splitY}" width="${width}" height="${height - splitY}" fill="#DCE8D7" />
    <ellipse cx="${width / 2}" cy="${splitY + 40}" rx="520" ry="120" fill="#94A3B8" fill-opacity="0.08" />
    <g id="arch-frame">
      <path d="M ${archX} ${archY + archH} L ${archX} ${archY + r} A ${r} ${r} 0 0 1 ${archX + archW} ${archY + r} L ${archX + archW} ${archY + archH} Z" fill="#FFFFFF" fill-opacity="0.55" stroke="#F8FAFC" stroke-width="3" />
      <path d="M ${archX + 24} ${archY + archH - 10} L ${archX + 24} ${archY + r + 10} A ${r - 24} ${r - 24} 0 0 1 ${archX + archW - 24} ${archY + r + 10} L ${archX + archW - 24} ${archY + archH - 10} Z" fill="none" stroke="#D97706" stroke-opacity="0.35" stroke-width="2" />
      ${star(archX + 80, archY + 120, 14)}
      ${star(archX + archW - 80, archY + 120, 14)}
      ${star(width / 2, archY - 30, 10)}
      ${star(archX + 120, archY + archH - 80, 10)}
    </g>
  `.trim();
}

function editorialBeautyCard(width: number, height: number): string {
  const frameX = 110;
  const frameY = 360;
  const frameW = width - 220;
  const frameH = 980;
  const pattern = `
    <g stroke="#CBD5E1" stroke-opacity="0.22" fill="none">
      <path d="M80 220 C 160 140, 240 140, 320 220" />
      <path d="M760 260 C 840 180, 920 180, 1000 260" />
      <circle cx="180" cy="420" r="22" />
      <circle cx="900" cy="520" r="18" />
      <path d="M120 1500 q 60 -40 120 0 t 120 0" />
      <path d="M720 1540 q 60 -40 120 0 t 120 0" />
    </g>
  `;
  return `
    ${sceneDefs()}
    <rect width="${width}" height="${height}" fill="#F8F4EE" />
    <rect width="${width}" height="${height}" fill="url(#scene-silver)" opacity="0.25" />
    ${pattern}
    <g id="editorial-frame" filter="url(#soft-shadow)">
      <rect x="${frameX}" y="${frameY}" width="${frameW}" height="${frameH}" rx="36" fill="#FFFFFF" fill-opacity="0.72" stroke="#E2E8F0" stroke-width="2" />
      <rect x="${frameX + 26}" y="${frameY + 26}" width="${frameW - 52}" height="${frameH - 52}" rx="28" fill="none" stroke="#CBD5E1" stroke-opacity="0.6" stroke-width="1.5" />
    </g>
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
        <rect width="${width}" height="${height}" fill="#FFFFFF" fill-opacity="0.06" />
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
