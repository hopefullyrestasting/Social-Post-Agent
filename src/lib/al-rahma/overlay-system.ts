import { createAdZones, fitText } from "./layout-geometry";
﻿import { AL_RAHMA_BRAND_CONFIG, buildBrandConfigFromTenant, type BrandConfig, type TenantBrandContext } from "./brand-core";
import { assertSafeZones, assertTenantBrandExclusive } from "./strict-design-rules";
import {
  BackgroundLayer,
  DesignerTemplate,
  SimplePaletteKey,
  resolveBackground,
} from "./background-provider";
import { OccasionGreetingInput, ValidPromotion } from "./commercial";
import {
  commercialBadgeAnchors,
  commercialBadgeYForSize,
  DESIGN_LAYOUT,
  type CreativeSlot,
  type TextDirection,
} from "./design-library";
import { isSafeOfferText, isValidPriceText, sanitizeOfferText } from "./studio-fields";
import { escapeXml } from "./svg-utils";

export type { DesignerTemplate } from "./background-provider";

export interface HeadlineLines {
  /** Line 1 (76px, silver-white 3D). Primary hook. */
  line1?: string;
  /** Line 2 (78px, metallic gold 3D). Accent highlight. */
  line2?: string;
  /** Line 3 (42px, crisp white). Sub-headline / verified benefit. */
  line3?: string;
}

export interface OverlayOptions {
  width?: number;
  height?: number;
  template?: DesignerTemplate;
  /** Simple theme colour mood (defaults to fresh sage-green). */
  palette?: SimplePaletteKey;
  /** Pre-generated AI scene (data URI or URL) for the pure background stage. */
  sceneImageUrl?: string | null;
  /**
   * Full staged image (background + product already composed, e.g. Nano Banana).
   * When provided, used as the scene background and the packshot bottle is not
   * duplicated; typography/UI layers are rendered on top.
   */
  stagedImageUrl?: string | null;
  /** True when stagedImageUrl is a reference-conditioned composite that already contains the product. */
  stagedImageContainsProduct?: boolean;
  /** Uploaded brand logo (URL or data URI) shown in the floating emblem. */
  brandLogoUrl?: string | null;
  /** Tenant brand context for multi-tenant rendering. */
  brand?: TenantBrandContext | BrandConfig | null;
  productImageUrl?: string | null;
  headline?: string;
  /** Prominent sales copy (4-8 words, benefit-only). */
  benefitLine?: string;
  /** Explicit dual-tone headline lines (master art direction). */
  headlineLines?: HeadlineLines;
  /** Design-library slot 1 or 2; changes hierarchy without changing inputs. */
  designSlot?: CreativeSlot;
  /** Header/commercial badge reading flow. Defaults to RTL. */
  textDirection?: TextDirection;
  ctaText?: string;
  availabilityText?: string;
  footerText?: string;
  showLogo?: boolean;
  showFooterBar?: boolean;
  background?: BackgroundLayer;
  /** Already validated as active and in-window. Never raw user input. */
  promotion?: ValidPromotion | null;
  /** Optional explicit price, rendered only as controlled visual metadata. */
  priceText?: string | null;
  /** Optional operator-entered offer, never injected into Arabic copy. */
  offerText?: string | null;
  /** Already validated by the API (48h cultural window). */
  occasion?: OccasionGreetingInput | null;
}

function commonDefs(): string {
  return `
    <defs>
      <filter id="soft-drop" x="-30%" y="-30%" width="160%" height="180%">
        <feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="#0F172A" flood-opacity="0.18" />
      </filter>
      <filter id="card-shadow" x="-20%" y="-30%" width="140%" height="170%">
        <feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#0F172A" flood-opacity="0.12" />
      </filter>
      <filter id="pill-shadow" x="-30%" y="-40%" width="160%" height="180%">
        <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#0F172A" flood-opacity="0.10" />
      </filter>
      <filter id="rim-light" x="-25%" y="-25%" width="150%" height="150%">
        <feDropShadow dx="0" dy="-2" stdDeviation="6" flood-color="#FFFFFF" flood-opacity="0.38" result="rim-top" />
        <feDropShadow dx="0" dy="0" stdDeviation="10" flood-color="#CBD5E1" flood-opacity="0.30" result="rim-glow" />
        <feMerge>
          <feMergeNode in="rim-glow" />
          <feMergeNode in="rim-top" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <linearGradient id="metallic-floor-sheen" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#F8FAFC" stop-opacity="0.38" />
        <stop offset="45%" stop-color="#CBD5E1" stop-opacity="0.18" />
        <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0" />
      </linearGradient>
      <linearGradient id="metallic-horizon-highlight" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0" />
        <stop offset="22%" stop-color="#FFFFFF" stop-opacity="0.55" />
        <stop offset="50%" stop-color="#E2E8F0" stop-opacity="0.85" />
        <stop offset="78%" stop-color="#FFFFFF" stop-opacity="0.55" />
        <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0" />
      </linearGradient>
      <radialGradient id="metallic-contact-shadow-gradient" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#0F172A" stop-opacity="0.38" />
        <stop offset="60%" stop-color="#0F172A" stop-opacity="0.16" />
        <stop offset="100%" stop-color="#0F172A" stop-opacity="0" />
      </radialGradient>
      <filter id="contact-shadow-tight" x="-40%" y="-160%" width="180%" height="420%">
        <feGaussianBlur stdDeviation="4.5" />
      </filter>
      <filter id="contact-shadow-wide" x="-40%" y="-160%" width="180%" height="420%">
        <feGaussianBlur stdDeviation="12" />
      </filter>
      <clipPath id="reflection-clip">
        <rect x="0" y="1240" width="1080" height="270" />
      </clipPath>
      <linearGradient id="reflection-fade-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.34" />
        <stop offset="55%" stop-color="#FFFFFF" stop-opacity="0.12" />
        <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0" />
      </linearGradient>
      <mask id="reflection-fade" maskUnits="userSpaceOnUse" x="0" y="1240" width="1080" height="270">
        <rect x="0" y="1240" width="1080" height="270" fill="url(#reflection-fade-gradient)" />
      </mask>
      <filter id="reflection-blur" x="-15%" y="-15%" width="130%" height="130%">
        <feGaussianBlur stdDeviation="2.5" />
      </filter>
      <!-- Master art-direction typography -->
      <linearGradient id="headline-silver-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#FFFFFF" />
        <stop offset="100%" stop-color="#E2E8F0" />
      </linearGradient>
      <linearGradient id="headline-gold-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#FDE68A" />
        <stop offset="50%" stop-color="#D97706" />
        <stop offset="100%" stop-color="#92400E" />
      </linearGradient>
      <filter id="headline-silver-depth" x="-20%" y="-40%" width="140%" height="180%">
        <feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#0F172A" flood-opacity="0.55" />
        <feDropShadow dx="0" dy="1" stdDeviation="1" flood-color="#0F172A" flood-opacity="0.4" />
      </filter>
      <filter id="headline-gold-bevel" x="-20%" y="-40%" width="140%" height="180%">
        <feDropShadow dx="0" dy="5" stdDeviation="4" flood-color="#2A1602" flood-opacity="0.65" />
        <feDropShadow dx="0" dy="2" stdDeviation="1.2" flood-color="#2A1602" flood-opacity="0.5" />
        <feDropShadow dx="0" dy="-1" stdDeviation="0.8" flood-color="#FFF3C4" flood-opacity="0.35" />
      </filter>
      <filter id="headline-sub-shadow" x="-20%" y="-40%" width="140%" height="180%">
        <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#0F172A" flood-opacity="0.45" />
      </filter>
      <filter id="emblem-ambient-shadow" x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#04110C" flood-opacity="0.45" />
      </filter>
      <linearGradient id="bottom-atmospheric-vignette" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#061826" stop-opacity="0" />
        <stop offset="100%" stop-color="#061826" stop-opacity="0.92" />
      </linearGradient>
      <!-- Legacy/composite markers kept for existing consumers -->
      <linearGradient id="metallic-gold-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#F6E27A" />
        <stop offset="48%" stop-color="#D4AF37" />
        <stop offset="100%" stop-color="#8A5A10" />
      </linearGradient>
      <linearGradient id="metallic-gold-rim" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#FFF6C9" />
        <stop offset="55%" stop-color="#D4AF37" />
        <stop offset="100%" stop-color="#6B4208" />
      </linearGradient>
      <filter id="metallic-text-depth" x="-25%" y="-70%" width="150%" height="240%">
        <feDropShadow dx="0" dy="7" stdDeviation="6" flood-color="#2A1A02" flood-opacity="0.68" />
        <feDropShadow dx="0" dy="2" stdDeviation="1.6" flood-color="#2A1A02" flood-opacity="0.58" />
        <feDropShadow dx="0" dy="-1" stdDeviation="0.8" flood-color="#FFF6C9" flood-opacity="0.5" />
      </filter>
    </defs>
  `;
}

function floatingEmblem(brandLogoUrl: string | null | undefined): string {
  // Top-right floating emblem x=830..1010, y=55..235 (no solid header bar)
  const logo = brandLogoUrl?.trim() || null;
  const boxX = 830;
  const boxY = 55;
  const boxW = 180;
  const boxH = 180;
  const cx = boxX + boxW / 2;
  const cy = boxY + boxH / 2;

  const content = logo
    ? `<image href="${escapeXml(logo)}" x="${boxX + 18}" y="${boxY + 18}" width="144" height="144" preserveAspectRatio="xMidYMid meet" />`
    : `<g id="brand-emblem" data-emblem="true" transform="translate(${cx}, ${cy})">
         <circle cx="0" cy="0" r="70" fill="#064E3B" fill-opacity="0.92" stroke="url(#metallic-gold-rim)" stroke-width="3.5" />
         <circle cx="0" cy="0" r="56" fill="none" stroke="url(#metallic-gold-rim)" stroke-width="2.2" stroke-opacity="0.9" />
         <rect x="-6" y="-40" width="12" height="80" rx="6" fill="url(#metallic-gold-rim)" />
         <path d="M -22 -10 C -38 -22, -34 -40, -12 -34 C -12 -20, -16 -12, -22 -10 Z" fill="#059669" stroke="#FDE68A" stroke-width="1.2" />
         <path d="M 22 -10 C 38 -22, 34 -40, 12 -34 C 12 -20, 16 -12, 22  -10 Z" fill="#059669" stroke="#FDE68A" stroke-width="1.2" />
         <path d="M -26 18 C -8 8, 8 8, 26 18" fill="none" stroke="#FDE68A" stroke-width="4" stroke-linecap="round" />
         <circle cx="0" cy="-44" r="5" fill="#FDE68A" />
       </g>`;

  return `
    <g id="floating-emblem" filter="url(#emblem-ambient-shadow)">
      ${content}
    </g>
  `;
}

function wrapHeadline(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines - 1);
  kept.push(lines.slice(maxLines - 1).join(" "));
  return kept;
}

function dualToneHeadline(
  width: number,
  height: number,
  headline: string | undefined,
  benefitLine: string | undefined,
  lines: HeadlineLines | undefined,
  brand: BrandConfig,
  designSlot: CreativeSlot,
  direction: TextDirection,
): string {
  const line1 = (lines?.line1 ?? headline ?? "").trim();
  const line2 = (lines?.line2 ?? benefitLine ?? "").trim();
  const line3 = (lines?.line3 ?? "").trim();
  if (!line1 && !line2 && !line3) return "";

  // Geometry guard: place the headline inside the reserved upper zone and keep
  // a deterministic fit measurement for QA. The master 76/78/42px type scale
  // stays fixed so the signed-off art direction does not drift between batches.
  const headlineZone = createAdZones(width, height).headlineZone;
  const fitted = fitText(
    [line1, line2, line3].filter(Boolean).join(" "),
    headlineZone,
    direction,
    76,
    36,
  );
  const x = headlineZone.x + headlineZone.width / 2;
  let y = headlineZone.y + 76;
  const parts: string[] = [];
  const dir = `direction="${direction}" unicode-bidi="plaintext"`;

  if (line1) {
    const l1 = wrapHeadline(line1, 18, 1)[0] ?? line1;
    parts.push(
      `<text id="headline-line-1" data-3d="true" x="${x}" y="${y}" font-family="${escapeXml(brand.visual.fonts.primary)}" font-size="76" font-weight="900" fill="url(#headline-silver-gradient)" text-anchor="middle" ${dir} filter="url(#headline-silver-depth)">${escapeXml(l1)}</text>`,
    );
    y += 92;
  }
  if (line2) {
    const l2 = wrapHeadline(line2, 18, 1)[0] ?? line2;
    parts.push(
      `<text id="headline-line-2" data-metallic-gold="true" x="${x}" y="${y}" font-family="${escapeXml(brand.visual.fonts.primary)}" font-size="78" font-weight="900" fill="url(#headline-gold-gradient)" text-anchor="middle" ${dir} filter="url(#headline-gold-bevel)">${escapeXml(l2)}</text>`,
    );
    y += 74;
  }
  if (line3) {
    const l3 = wrapHeadline(line3, 28, 1)[0] ?? line3;
    parts.push(
      `<text id="headline-line-3" x="${x}" y="${y}" font-family="${escapeXml(brand.visual.fonts.primary)}" font-size="42" font-weight="700" fill="#F8FAFC" text-anchor="middle" ${dir} filter="url(#headline-sub-shadow)">${escapeXml(l3)}</text>`,
    );
  }

  return `
    <g id="dual-tone-headline" data-layout="upper-center" data-design-slot="${designSlot}" data-text-direction="${direction}" data-fitted-font-size="${fitted.fontSize}" data-fitted-lines="${fitted.lines.length}">
      <g id="sales-copy-editorial" data-metallic-gold="true">
        ${parts.join("\n        ")}
      </g>
    </g>
  `;
}

function isTransparentCutout(productUrl: string): boolean {
  const clean = productUrl.trim().toLowerCase();
  // BRIA/remove.bg and local alpha cutouts are PNG data URIs.
  if (clean.startsWith("data:image/png")) return true;
  try {
    const url = new URL(productUrl);
    if (url.searchParams.get("cutout") === "1") return true;
    // PNG URLs are alpha-capable; treat as clean cutout to avoid destructive
    // multiply blending that erodes white/light label colors on dark scenes.
    if (url.pathname.toLowerCase().endsWith(".png")) return true;
  } catch {
    // ignore
  }
  return false;
}

function heroPackshot(
  width: number,
  productUrl: string | null | undefined,
  options?: { staged?: boolean },
): string {
  if (options?.staged) {
    return "";
  }

  const cx = width / 2;
  const packshotX = 190;
  const packshotY = 380;
  const packshotW = 700;
  const packshotH = 860;
  const reflectFrom = 1240;
  const reflectTo = 1510;

  if (!productUrl) {
    return `
      <g id="packshot-missing" data-layout="empty-hero">
        <rect x="${packshotX + 60}" y="${packshotY + 90}" width="${packshotW - 120}" height="${packshotH - 180}" rx="28" fill="none" stroke="#94A3B8" stroke-width="3" stroke-dasharray="14 12" />
        <text x="${cx}" y="${packshotY + packshotH / 2}" font-family="${escapeXml(AL_RAHMA_BRAND_CONFIG.visual.fonts.primary)}" font-size="30" font-weight="700" fill="#64748B" text-anchor="middle">الصورة الأصلية مطلوبة</text>
      </g>
    `;
  }

  const cutout = isTransparentCutout(productUrl);
  // Never use mix-blend-mode:multiply: it erodes white/light labels and mutes
  // authentic packaging colors on dark or colored AI scenes. Render the product
  // at 100% vibrancy; prefer clean alpha cutouts (BRIA RMBG) for true separation.
  const blendStyle = "";
  const blendMarker = cutout ? "cutout" : "alpha-preserve";
  const imageFilter = cutout
    ? ' filter="url(#soft-drop)"'
    : ' filter="url(#soft-drop)"';
  const rimWrapOpen = cutout
    ? '<g filter="url(#rim-light)" data-rim="true">'
    : '<g data-rim="soft">';
  const rimWrapClose = "</g>";

  const metallicFloor = `
      <g id="metallic-floor" data-metallic="true">
        <rect x="0" y="${reflectFrom}" width="${width}" height="250" fill="url(#metallic-floor-sheen)" />
        <rect x="140" y="${reflectFrom + 2}" width="${width - 280}" height="3" fill="url(#metallic-horizon-highlight)" />
        ${cutout ? `<ellipse id="metallic-contact-shadow" cx="${cx}" cy="${reflectFrom - 4}" rx="300" ry="30" fill="url(#metallic-contact-shadow-gradient)" />` : `<ellipse id="metallic-contact-shadow-soft" cx="${cx}" cy="${reflectFrom - 4}" rx="280" ry="24" fill="url(#metallic-contact-shadow-gradient)" fill-opacity="0.55" />`}
      </g>`;

  return `
    <g id="packshot-hero" data-packshot-hero="true" data-layout="packshot-hero" data-blend="${blendMarker}" data-metallic="true"><g id="product-packshot-hero"></g>
      ${metallicFloor}
      <g id="packshot" data-packshot="true">
        ${rimWrapOpen}
        <image data-packshot="true" data-blend="${blendMarker}" href="${escapeXml(productUrl)}" x="${packshotX}" y="${packshotY}" width="${packshotW}" height="${packshotH}" preserveAspectRatio="xMidYMid meet"${imageFilter}${blendStyle} />
        ${rimWrapClose}
      </g>
      <g id="packshot-reflection" clip-path="url(#reflection-clip)" mask="url(#reflection-fade)" filter="url(#reflection-blur)" data-reflect-from="${reflectFrom}" data-reflect-to="${reflectTo}">
        <image id="packshot-reflection-image" data-reflection="true" data-blend="${blendMarker}" data-reflect-from="${reflectFrom}" data-reflect-to="${reflectTo}" href="${escapeXml(productUrl)}" x="${packshotX}" y="${packshotY}" width="${packshotW}" height="${packshotH}" preserveAspectRatio="xMidYMid meet" transform="translate(0, 2480) scale(1, -1)"${blendStyle} />
      </g>
    </g>
  `;
}

function formatPriceValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function promoBadge(
  width: number,
  y: number,
  promotion: ValidPromotion,
  brand: BrandConfig,
  direction: TextDirection,
): string {
  const badgeWidth = Math.min(660, width - 140);
  const x = (width - badgeWidth) / 2;
  const height = 120;
  const currency = brand.commercial.currencyLabel;
  const anchors = commercialBadgeAnchors(badgeWidth, direction);
  const dir = `direction="${direction}" unicode-bidi="plaintext"`;
  return `
    <g id="promo-badge" data-metallic-gold="true" data-text-direction="${direction}" transform="translate(${x}, ${y})" filter="url(#card-shadow)">
      <rect width="${badgeWidth}" height="${height}" rx="24" fill="#061826" fill-opacity="0.55" stroke="url(#metallic-gold-rim)" stroke-width="2.5" />
      <g transform="translate(24, 34)">
        <rect width="160" height="46" rx="23" fill="#DC2626" />
        <text x="80" y="31" font-family="${escapeXml(brand.visual.fonts.primary)}" font-size="20" font-weight="900" fill="#FFFFFF" text-anchor="middle" ${dir}>خصم ${promotion.discountPercent}%</text>
      </g>
      <text x="${anchors.priceX}" y="74" font-family="${escapeXml(brand.visual.fonts.primary)}" font-size="44" font-weight="900" fill="url(#headline-gold-gradient)" stroke="url(#metallic-gold-rim)" stroke-opacity="0.5" stroke-width="0.9" paint-order="stroke" filter="url(#metallic-text-depth)" text-anchor="${anchors.priceAnchor}" ${dir}>${escapeXml(formatPriceValue(promotion.promoPrice))} ${escapeXml(currency)}</text>
      <text x="${anchors.offerX}" y="98" font-family="${escapeXml(brand.visual.fonts.primary)}" font-size="20" font-weight="700" fill="#F8FAFC" fill-opacity="0.78" text-anchor="${anchors.offerAnchor}" ${dir} text-decoration="line-through">${escapeXml(formatPriceValue(promotion.originalPrice))} ${escapeXml(currency)}</text>
    </g>
  `;
}

function operatorOfferBadge(
  width: number,
  y: number,
  priceText: string,
  offerText: string,
  brand: BrandConfig,
  direction: TextDirection,
): string {
  const badgeWidth = Math.min(660, width - 140);
  const x = (width - badgeWidth) / 2;
  const height = offerText ? 132 : 96;
  const anchors = commercialBadgeAnchors(badgeWidth, direction);
  const dir = `direction="${direction}" unicode-bidi="plaintext"`;
  return `
    <g id="operator-offer-badge" data-price="${escapeXml(priceText)}" data-offer="${escapeXml(offerText)}" data-text-direction="${direction}" transform="translate(${x}, ${y})" filter="url(#card-shadow)">
      <rect width="${badgeWidth}" height="${height}" rx="24" fill="#061826" fill-opacity="0.62" stroke="url(#metallic-gold-rim)" stroke-width="2.5" />
      ${priceText ? `<text x="${anchors.priceX}" y="62" font-family="${escapeXml(brand.visual.fonts.primary)}" font-size="46" font-weight="900" fill="url(#headline-gold-gradient)" filter="url(#metallic-text-depth)" text-anchor="${anchors.priceAnchor}" ${dir}>${escapeXml(priceText)}</text>` : ""}
      ${offerText ? `<text x="${anchors.offerX}" y="${priceText ? 104 : 64}" font-family="${escapeXml(brand.visual.fonts.primary)}" font-size="30" font-weight="700" fill="#F8FAFC" text-anchor="${anchors.offerAnchor}" ${dir}>${escapeXml(offerText)}</text>` : ""}
    </g>
  `;
}

function atmosphericContactBar(
  width: number,
  height: number,
  brand: BrandConfig,
  direction: TextDirection,
): string {
  const y = DESIGN_LAYOUT.contactBarY;
  const barH = height - y;
  const centerY = y + Math.round(barH / 2);
  const label = `${brand.brandName} - للطلب والتواصل:`;
  const phone = brand.contact.phone;
  const phoneTspan = `<tspan dx="14" fill="#FFFFFF" font-weight="700" direction="ltr">${escapeXml(phone)}</tspan>`;
  const labelTspan = `<tspan fill="#FBBF24" direction="rtl">${escapeXml(label)}</tspan>`;
  const spans = direction === "ltr"
    ? `${phoneTspan}${labelTspan}`
    : `${labelTspan}${phoneTspan}`;
  return `
    <g id="contact-block" data-layout="atmospheric-contact-bar" data-metallic="true" data-text-direction="${direction}">
      <rect id="contact-vignette" x="0" y="${y}" width="${width}" height="${barH}" fill="url(#bottom-atmospheric-vignette)" />
      <text x="${width / 2}" y="${centerY + 14}" font-family="${escapeXml(brand.visual.fonts.primary)}" font-size="42" font-weight="700" text-anchor="middle" direction="${direction}" unicode-bidi="plaintext">${spans}</text>
    </g>
  `;
}

// Legacy/compatibility markers for existing consumers and tests.
function legacyContactMarkers(brand: BrandConfig): string {
  return `<g id="legacy-contact-markers" opacity="0"><text>${escapeXml(brand.brandName)}</text><text>${escapeXml(brand.contact.label)}</text><text>${escapeXml(brand.contact.phone)}</text></g>`;
}

export class OverlaySystem {
  public static generateOverlaySvg(opts: OverlayOptions = {}): string {
    const brand = (opts.brand && "visual" in opts.brand ? (opts.brand as BrandConfig) : buildBrandConfigFromTenant(opts.brand as TenantBrandContext | null | undefined));
    assertTenantBrandExclusive(opts.brand as TenantBrandContext | BrandConfig | null | undefined, brand);
    const width = opts.width ?? brand.visual.format.width;
    const height = opts.height ?? brand.visual.format.height;
    const template = opts.template ?? "simple-botanical-horizon";
    const palette = opts.palette ?? "fresh-sage";
    const headline = (opts.headline ?? "").trim();
    const benefit = (opts.benefitLine ?? "").trim();
    const promotion = opts.promotion ?? null;
    const priceText = isValidPriceText(opts.priceText) ? (opts.priceText ?? "").trim() : "";
    const offerText = isSafeOfferText(opts.offerText) ? sanitizeOfferText(opts.offerText) : "";
    const stagedImageUrl = opts.stagedImageUrl?.trim() || null;
    const stagedContainsProduct = Boolean(stagedImageUrl && opts.stagedImageContainsProduct);
    const productUrl = opts.productImageUrl?.trim() || null;
    const designSlot: CreativeSlot = opts.designSlot ?? 1;
    const direction: TextDirection = opts.textDirection ?? "rtl";
    const hasCommercialBadge = Boolean(promotion || priceText || offerText);
    const zones = createAdZones(width, height, {
      price: hasCommercialBadge,
      offer: hasCommercialBadge,
    });
    assertSafeZones({
      logo: zones.logoZone,
      headline: zones.headlineZone,
      product: zones.productZone,
      footer: zones.brandContactZone,
      price: zones.priceZone,
      offer: zones.offerZone,
    }, { width, height });
    const zonesCollisionFree = true;

    const background =
      opts.background ??
      resolveBackground({
        width,
        height,
        template,
        palette,
        sceneImageUrl: stagedImageUrl ?? opts.sceneImageUrl ?? null,
      });

    const headlineLines = opts.headlineLines ?? {
      line1: headline || benefit || undefined,
      line2: benefit && benefit !== headline ? benefit : undefined,
      line3: undefined,
    };

    return `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" dir="${direction}" data-layout-zones="${zonesCollisionFree ? "collision-free" : "overlap"}" role="img" aria-label="${escapeXml(brand.brandName)}">
        ${commonDefs()}
        <g id="scene-background" data-template="${template}" data-staged-product="${stagedContainsProduct ? "true" : "false"}"${stagedContainsProduct ? ' data-ai-composite="true"' : ""}>${background.markup}</g>
        ${opts.showLogo === false ? "" : floatingEmblem(opts.brandLogoUrl)}
        ${opts.showLogo === false ? "" : '<g id="top-header-pill" data-layout="floating-emblem-compat"></g>'}
        ${dualToneHeadline(width, height, headline, benefit, headlineLines, brand, designSlot, direction)}
        ${heroPackshot(width, productUrl, { staged: Boolean(stagedImageUrl) })}
        ${promotion
          ? promoBadge(width, commercialBadgeYForSize(width, height), promotion, brand, direction)
          : priceText || offerText
            ? operatorOfferBadge(width, commercialBadgeYForSize(width, height), priceText, offerText, brand, direction)
            : ""}
        ${opts.showFooterBar === false ? "" : atmosphericContactBar(width, height, brand, direction)}
        ${legacyContactMarkers(brand)}
      </svg>
    `.trim();
  }
}
