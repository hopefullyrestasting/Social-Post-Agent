import {
  AL_RAHMA_BRAND_CONFIG,
  type BrandConfig,
  type TenantBrandContext,
  type TenantBrandSource,
} from "./brand-core";
import type { Rect } from "./layout-geometry";

const CAMERA_PREFIX =
  /^(?:whatsapp(?:\s+image)?|img|dsc|image|photo|screenshot|screen[\s_-]*shot|pxl|signal|telegram)[\s_-]*\d/i;
const HASHED_FILE = /^[a-f0-9]{16,}(?:\.[a-z0-9]{1,5})?$/i;
const HASH_TOKEN = /(?:^|[\s_.-])[a-f0-9]{16,}(?:$|[\s_.-])/i;
const IMAGE_EXTENSION = /\.(?:jpe?g|png|webp|heic|heif|avif|gif|bmp|tiff?)$/i;
const CAMERA_STEM =
  /(?:^|[\s_-])(?:whatsapp|img|dsc|image|photo|screenshot|signal|telegram)(?:$|[\s_-])/i;
const CAMERA_FILENAME_IN_TEXT =
  /(?:^|[\s/([{])(?:whatsapp(?:\s+image)?|img|dsc|image|photo|screenshot|screen[\s_-]*shot|pxl|signal|telegram)[\s_-]*\d[\w\s.:-]*?\.(?:jpe?g|png|webp|heic|heif|avif|gif|bmp|tiff?)(?=$|[\s)\]},;])/i;

function collapse(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

export function isRawFilename(value: string | null | undefined): boolean {
  const text = collapse(value);
  if (!text) return false;
  if (
    HASHED_FILE.test(text) ||
    HASH_TOKEN.test(text) ||
    CAMERA_PREFIX.test(text) ||
    CAMERA_FILENAME_IN_TEXT.test(text)
  ) {
    return true;
  }
  if (!IMAGE_EXTENSION.test(text)) return false;
  const stem = text.replace(IMAGE_EXTENSION, "");
  return CAMERA_STEM.test(stem) || /\d{6,}/.test(stem);
}

export function cleanMarketingText(
  value: string | null | undefined,
  fallback: string,
): string {
  const text = collapse(value);
  if (!text || isRawFilename(text)) return fallback;
  return text.slice(0, 120);
}

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

function lockedBrandName(
  tenant: TenantBrandSource | BrandConfig | null | undefined,
): string {
  if (!tenant) return "";
  const direct = (tenant as TenantBrandContext).brandName;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const nested = "brand" in tenant ? tenant.brand : null;
  return typeof nested?.brandName === "string" ? nested.brandName.trim() : "";
}

export function assertTenantBrandExclusive(
  tenant: TenantBrandSource | BrandConfig | null | undefined,
  resolved: BrandConfig,
): void {
  const locked = lockedBrandName(tenant);
  if (locked && (resolved.brandName ?? "").trim() !== locked) {
    throw new Error("Tenant brand context must resolve to its own locked identity.");
  }
}

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
  logo?: Rect | null;
  headline: Rect;
  product: Rect;
  offer?: Rect | null;
  price?: Rect | null;
  footer?: Rect | null;
}

const intersects = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;

const isFiniteRect = (rect: Rect): boolean =>
  [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite);

export function assertSafeZones(
  zones: RuleZones,
  canvas: { width: number; height: number } = { width: 1080, height: 1920 },
): void {
  if (
    !Number.isFinite(canvas.width) ||
    !Number.isFinite(canvas.height) ||
    canvas.width <= 0 ||
    canvas.height <= 0
  ) {
    throw new Error("Creative canvas dimensions are invalid.");
  }

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

  for (let index = 0; index < entries.length; index += 1) {
    for (let other = index + 1; other < entries.length; other += 1) {
      if (intersects(entries[index]![1], entries[other]![1])) {
        throw new Error(
          `Creative zones "${entries[index]![0]}" and "${entries[other]![0]}" overlap.`,
        );
      }
    }
  }
}
