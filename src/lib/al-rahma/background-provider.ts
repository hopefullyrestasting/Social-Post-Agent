import { AL_RAHMA_BRAND_CONFIG } from "./brand-core";
import { escapeXml } from "./svg-utils";

/**
 * Background layer for the ad composer.
 *
 * The default provider is a free, deterministic white + silver-mesh studio.
 * Optional adapters can supply a pre-rendered background image URL from the
 * environment. They never require paid keys: when unconfigured, the composer
 * falls back to the deterministic studio and records why.
 */

export type BackgroundProviderId =
  | "deterministic-studio"
  | "cloudflare-ai"
  | "muapi";

export type AdVariant = "hero-clean" | "studio-angle";

export interface BackgroundRequest {
  width: number;
  height: number;
  variant: AdVariant;
}

export interface BackgroundLayer {
  provider: BackgroundProviderId;
  requestedProvider: BackgroundProviderId;
  kind: "mesh" | "image";
  markup: string;
  fallbackReason?: string;
}

export interface BackgroundProvider {
  id: BackgroundProviderId;
  isConfigured(): boolean;
  resolve(request: BackgroundRequest): BackgroundLayer;
}

function readEnv(...keys: string[]): string | undefined {
  if (typeof process === "undefined" || !process.env) return undefined;
  for (const key of keys) {
    const value = process.env[key];
    if (value) return value;
  }
  return undefined;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function deterministicMarkup({ width, height }: BackgroundRequest): string {
  const background = AL_RAHMA_BRAND_CONFIG.visual.background;
  const mesh = background.mesh;
  const accent = AL_RAHMA_BRAND_CONFIG.visual.primaryColors.emerald;

  return `
    <defs>
      <pattern id="silver-mesh" width="56" height="56" patternUnits="userSpaceOnUse" patternTransform="rotate(24)">
        <path d="M 56 0 L 0 0 0 56" fill="none" stroke="${mesh.color}" stroke-width="1" stroke-opacity="${mesh.opacity}" />
        <circle cx="28" cy="28" r="1.1" fill="${mesh.color}" fill-opacity="${Math.min(1, mesh.opacity + 0.12)}" />
      </pattern>
      <radialGradient id="studio-glow" cx="50%" cy="46%" r="52%">
        <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.95" />
        <stop offset="62%" stop-color="${background.baseColor}" stop-opacity="0.55" />
        <stop offset="100%" stop-color="${background.baseColor}" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="floor-fade" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${accent}" stop-opacity="0.10" />
        <stop offset="100%" stop-color="${accent}" stop-opacity="0" />
      </radialGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="${background.baseColor}" />
    <rect width="${width}" height="${height}" fill="url(#silver-mesh)" />
    <rect width="${width}" height="${height}" fill="url(#studio-glow)" />
    <ellipse cx="${width / 2}" cy="${Math.round(height * 0.72)}" rx="${Math.round(width * 0.42)}" ry="${Math.round(height * 0.15)}" fill="url(#floor-fade)" />
  `.trim();
}

export const deterministicStudioProvider: BackgroundProvider = {
  id: "deterministic-studio",
  isConfigured: () => true,
  resolve: (request) => ({
    provider: "deterministic-studio",
    requestedProvider: "deterministic-studio",
    kind: "mesh",
    markup: deterministicMarkup(request),
  }),
};

function createImageProvider(
  id: Exclude<BackgroundProviderId, "deterministic-studio">,
  envKeys: string[],
): BackgroundProvider {
  const imageUrl = readEnv(...envKeys);
  const usable = Boolean(imageUrl && isHttpUrl(imageUrl));

  return {
    id,
    isConfigured: () => usable,
    resolve: (request) => ({
      provider: id,
      requestedProvider: id,
      kind: "image",
      markup: usable
        ? `<image href="${escapeXml(imageUrl as string)}" x="0" y="0" width="${request.width}" height="${request.height}" preserveAspectRatio="xMidYMid slice" opacity="0.35" />`
        : "",
    }),
  };
}

/**
 * Optional adapters. Set one of the env vars to a hosted background image URL
 * to enable the adapter; otherwise the deterministic studio is used.
 * Server-only env vars are preferred; NEXT_PUBLIC_ variants work in the browser.
 */
export const cloudflareAiBackgroundProvider = createImageProvider(
  "cloudflare-ai",
  [
    "CLOUDFLARE_AI_BACKGROUND_URL",
    "NEXT_PUBLIC_CLOUDFLARE_AI_BACKGROUND_URL",
  ],
);

export const muapiBackgroundProvider = createImageProvider("muapi", [
  "MUAPI_BACKGROUND_URL",
  "NEXT_PUBLIC_MUAPI_BACKGROUND_URL",
]);

const PROVIDERS: Record<BackgroundProviderId, BackgroundProvider> = {
  "deterministic-studio": deterministicStudioProvider,
  "cloudflare-ai": cloudflareAiBackgroundProvider,
  muapi: muapiBackgroundProvider,
};

export function resolveBackground(
  requested: BackgroundProviderId | undefined,
  request: BackgroundRequest,
): BackgroundLayer {
  const requestedProvider = requested ?? "deterministic-studio";
  const provider = PROVIDERS[requestedProvider] ?? deterministicStudioProvider;

  if (provider.id === "deterministic-studio" || provider.isConfigured()) {
    return provider.resolve(request);
  }

  return {
    ...deterministicStudioProvider.resolve(request),
    requestedProvider,
    fallbackReason: `${requestedProvider} is not configured; using deterministic-studio.`,
  };
}
