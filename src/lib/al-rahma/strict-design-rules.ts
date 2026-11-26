import {
  AL_RAHMA_BRAND_CONFIG,
  type BrandConfig,
  type TenantBrandContext,
  type TenantBrandSource,
} from "./brand-core";
import type { Rect } from "./layout-geometry";

/**
 * Strict creative-rule guards shared by the copy, overlay, upload and campaign
 * pipelines.
 *
 * They exist so a rule can only be implemented once: raw storage/camera
 * filenames never reach human-facing copy, operator-owned commercial metadata
 * stays optional, layout zones never clip or collide, and a locked tenant never
 * renders the legacy default brand.
 */

const CAMERA_PREFIX =
  /^(?:whatsapp(?:\s+image)?|img|dsc|image|photo|screenshot|screen[\s_-]*shot|pxl|signal|telegram)[\s_-]*\d/i;
const HASHED_FILE = /^[a-f0-9]{16,}(?:\.[a-z0-9]{1,5})?$/i;
const IMAGE_EXTENSION = /\.(?:jpe?g|png|webp|heic|heif|avif|gif|bmp|tiff?)$/i;
const CAMERA_STEM = /(?:^|[\s_-])(?:whatsapp|img|dsc|image|photo|screenshot|signal|telegram)(?:$|[\s_-])/i;

function collapse(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

/** True for storage/camera/chat export names that must never be shown to people. */
export function isRawFilename(value: string | null | undefined): boolean {
  const text = collapse(value);
  if (!text) return false;
  if (HASHED_FILE.test(text)) return true;
  if (CAMERA_PREFIX.test(text)) return true;
  if (!IMAGE_EXTENSION.test(text)) return false;
  const stem = text.replace(IMAGE_EXTENSION, "");
  return CAMERA_STEM.test(stem) || /\d{6,}/.test(stem);
}

/** Removes storage/camera filenames before they can enter human-facing creative copy. */
export function cleanMarketingText(
  value: string | null | undefined,
  fallback: string,
): string {
  const text = collapse(value);
  if (!text || isRawFilename(text)) return fallback;
  return text.slice(0, 120);
}

/** First clean candidate wins; useful when a label, stem and category compete. */
export function pickMarketingText(
  values: ReadonlyArray<string | null | undefined>,
  fallback: string,
  max = 160,
): string {
  for (const value of values) {
    const text = collapse(value);
    if (text && !isRawFilename(text)) return text.slice(0, max);
  }
  return fallback;
}

/** Reads a locked tenant name from either a flat or nested context shape. */
function lockedBrandName(
  tenant: TenantBrandSource | BrandConfig | null | undefined,
): string {
  if (!tenant) return "";
  const direct = (tenant as TenantBrandContext).brandName;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const nested = "brand" in tenant ? tenant.brand : null;
  return typeof nested?.brandName === "string" ? nested.brandName.trim() : "";
}

/** Tenant renders must always carry the locked brand identity, not the legacy default. */
export function assertTenantBrandExclusive(
  tenant: TenantBrandSource | BrandConfig | null | undefined,
  resolved: BrandConfig,
): void {
  const locked = lockedBrandName(tenant);
  if (!locked) return;
  if ((resolved.brandName ?? "").trim() !== locked) {
    throw new Error("Tenant brand context must resolve to its own locked identity.");
  }
}

/**
 * Guards generated human-facing text after resolution. A locked tenant may
 * never contain the legacy default brand name or its English label.
 */
export function assertNoLegacyBrandLeak(
  text: string | null | undefined,
  resolved: BrandConfig,
): void {
  const body = text ?? "";
  const own = (resolved.brandName ?? "").trim();
  const legacyNames = [
    AL_RAHMA_BRAND_CONFIG.brandName,
    AL_RAHMA_BRAND_CONFIG.brandNameEnglish,
  ]
    .map((name) => name.trim())
    .filter((name) => name.length >= 4 && name !== own);
  for (const legacy of legacyNames) {
    if (body.includes(legacy)) {
      throw new Error("Locked tenant output must not contain the legacy brand identity.");
    }
  }
}

export interface RuleZones {
  logo: Rect;
  headline: Rect;
  product: Rect;
  offer?: Rect | null;
  price?: Rect | null;
  footer: Rect;
}

const intersects = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;

const isFiniteRect = (rect: Rect): boolean =>
  [rect.x, rect.y, rect.width, rect.height].every((value) => Number.isFinite(value));

/**
 * Proves a creative is publishable: every active zone is finite, non-empty,
 * inside the canvas and disjoint from every other zone. Optional price/offer
 * zones are skipped when absent, so the same guard serves conditional layouts.
 */
export function assertSafeZones(
  zones: RuleZones,
  canvas: { width: number; height: number } = { width: 1080, height: 1920 },
): void {
  const entries = Object.entries(zones).filter(
    (entry): entry is [string, Rect] => Boolean(entry[1]),
  );
  for (const [name, zone] of entries) {
    if (!isFiniteRect(zone) || zone.width <= 0 || zone.height <= 0) {
      throw new Error(`Creative zone "${name}" is invalid.`);
    }
    if (
      zone.x < 0 ||
      zone.y < 0 ||
      zone.x + zone.width > canvas.width ||
      zone.y + zone.height > canvas.height
    ) {
      throw new Error(`Creative zone "${name}" clips off canvas.`);
    }
  }
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      if (intersects(entries[i]![1], entries[j]![1])) {
        throw new Error(
          `Creative zones "${entries[i]![0]}" and "${entries[j]![0]}" overlap.`,
        );
      }
    }
  }
}
