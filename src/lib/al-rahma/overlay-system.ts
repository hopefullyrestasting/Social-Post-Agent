import { AL_RAHMA_BRAND_CONFIG } from "./brand-core";
import {
  BackgroundLayer,
  DesignerTemplate,
  resolveBackground,
} from "./background-provider";
import { OccasionGreetingInput, ValidPromotion } from "./commercial";
import { escapeXml, wrapText, wrapTextNoTruncate } from "./svg-utils";

export type { DesignerTemplate } from "./background-provider";

export interface OverlayOptions {
  width?: number;
  height?: number;
  template?: DesignerTemplate;
  /** Pre-generated AI scene (data URI or URL) for the pure background stage. */
  sceneImageUrl?: string | null;
  /**
   * Full staged image (background + product already composed, e.g. Nano Banana).
   * When provided, used as the scene background and the packshot bottle is not
   * duplicated; typography/UI layers are rendered on top.
   */
  stagedImageUrl?: string | null;
  /** Uploaded brand logo (URL or data URI) shown in the top brand badge. */
  brandLogoUrl?: string | null;
  productImageUrl?: string | null;
  headline?: string;
  /** Prominent sales copy (4-8 words, benefit-only). */
  benefitLine?: string;
  ctaText?: string;
  availabilityText?: string;
  footerText?: string;
  showLogo?: boolean;
  showFooterBar?: boolean;
  background?: BackgroundLayer;
  /** Already validated as active and in-window. Never raw user input. */
  promotion?: ValidPromotion | null;
  /** Already validated by the API (48h cultural window). */
  occasion?: OccasionGreetingInput | null;
}

const BRAND = AL_RAHMA_BRAND_CONFIG;
const HEADER_ACTIVITY = "مستحضرات تجميل ومستلزمات الصيدليات - متاح توصيل";
const CONTACT_LABEL = "\u200Fللتواصل:";

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
        <feDropShadow dx="0" dy="-2" stdDeviation="6" flood-color="#FFFFFF" flood-opacity="0.22" />
        <feDropShadow dx="0" dy="0" stdDeviation="10" flood-color="#E2E8F0" flood-opacity="0.18" />
      </filter>
      <filter id="contact-shadow-tight" x="-40%" y="-160%" width="180%" height="420%">
        <feGaussianBlur stdDeviation="4.5" />
      </filter>
      <filter id="contact-shadow-wide" x="-40%" y="-160%" width="180%" height="420%">
        <feGaussianBlur stdDeviation="12" />
      </filter>
    </defs>
  `;
}

function headerPill(width: number, brandLogoUrl?: string | null): string {
  // Top Header Pill y=48..198
  const x = 48;
  const y = 48;
  const w = width - 96;
  const h = 150;
  const logo = brandLogoUrl?.trim() || null;

  const rightGroupX = w - 24; // anchor from right inside pill
  const logoSize = 86;
  const logoX = rightGroupX - logoSize;
  const logoY = (h - logoSize) / 2;
  const brandX = logoX - 16;
  const dividerX = 770 - x; // local x for absolute divider at x=770 within translated header group

  const logoNode = logo
    ? `<image href="${escapeXml(logo)}" x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet" />
       <rect x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" rx="20" fill="#FFFFFF" fill-opacity="0.10" stroke="#FFFFFF" stroke-opacity="0.18" />`
    : `<rect x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" rx="20" fill="#FFFFFF" fill-opacity="0.12" stroke="#FFFFFF" stroke-opacity="0.18" />
       <circle cx="${logoX + logoSize / 2}" cy="${logoY + logoSize / 2}" r="24" fill="#059669" />
       <path d="M ${logoX + 30} ${logoY + 45} L ${logoX + 40} ${logoY + 56} L ${logoX + 58} ${logoY + 34}" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />`;

  return `
    <g id="top-header-pill" transform="translate(${x}, ${y})">
      <rect width="${w}" height="${h}" rx="36" fill="#113D2E" />
      ${logoNode}
      <text x="${brandX}" y="92" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="40" font-weight="800" fill="#FFFFFF" text-anchor="end">${escapeXml(BRAND.brandName)}</text>
      <line id="header-divider" x1="${dividerX}" y1="34" x2="${dividerX}" y2="${h - 34}" stroke="#FFFFFF" stroke-opacity="0.42" stroke-width="2" />
      <text x="${dividerX - 26}" y="90" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="32" font-weight="700" fill="#FFFFFF" text-anchor="end">${escapeXml(HEADER_ACTIVITY)}</text>
    </g>
  `;
}

function productTitle(width: number, headline: string): string {
  // Product Title y=245..410, Cairo 900, 56-64px, centered, max 2 lines, zero ellipsis
  const x = width / 2;
  const { lines, charsPerLine } = wrapTextNoTruncate(headline, 24, 2, 12);
  const size = Math.max(56, Math.min(64, 56 + Math.max(0, 22 - charsPerLine)));
  const lineHeight = Math.round(size * 1.28);
  const blockH = size + (lines.length - 1) * lineHeight;
  const top = 275;
  const bottom = 400;
  const y = Math.min(top + size, bottom - Math.max(0, blockH - size));

  const tspans = lines
    .map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`)
    .join("");
  return `
    <g id="product-title">
      <text x="${x}" y="${y}" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="${size}" font-weight="900" fill="#1F2937" text-anchor="middle" direction="rtl">${tspans}</text>
    </g>
  `;
}

function featurePill(x: number, y: number, text: string): string {
  const w = 286;
  const h = 72;
  return `
    <g transform="translate(${x}, ${y})" filter="url(#pill-shadow)">
      <rect width="${w}" height="${h}" rx="24" fill="#FFFFFF" fill-opacity="0.92" stroke="#E2E8F0" stroke-width="1.5" />
      <rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="22.5" fill="#FFFFFF" fill-opacity="0.18" />
      <circle cx="42" cy="${h / 2}" r="16" fill="#059669" />
      <path d="M 34 ${h / 2 + 1} l 5 5 l 10 -12" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
      <text x="${w / 2 + 14}" y="${h / 2 + 9}" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="24" font-weight="700" fill="#334155" text-anchor="middle">${escapeXml(text)}</text>
    </g>
  `;
}

function heroPackshot(
  width: number,
  productUrl: string | null | undefined,
  options?: { staged?: boolean },
): string {
  // Side Feature Pills y=820..910 (always rendered as typography/UI overlay)
  const badges = `
    <g id="feature-pills">
      ${featurePill(width - 64 - 286, 820, "تركيبة طبيعية")}
      ${featurePill(64, 840, "جودة مضمونة")}
    </g>
  `;

  // When a full staged image (background+product) is provided, do not duplicate the bottle.
  if (options?.staged) {
    return badges;
  }

  // Hero packshot y=460..1240, h=740 w=580 x=250 y=490, bottom seated at 1230
  const cx = width / 2;
  const packshotX = 250;
  const packshotY = 490;
  const packshotW = 580;
  const packshotH = 740;
  const bottom = 1230;

  let packshot: string;
  if (!productUrl) {
    packshot = `
      <g id="packshot-missing">
        <rect x="${packshotX}" y="${packshotY}" width="${packshotW}" height="${packshotH}" rx="28" fill="none" stroke="#94A3B8" stroke-width="3" stroke-dasharray="14 12" />
        <text x="${cx}" y="${packshotY + packshotH / 2}" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="28" font-weight="700" fill="#64748B" text-anchor="middle">الصورة الأصلية غير متاحة</text>
      </g>
    `;
  } else {
    packshot = `
      <g id="packshot-hero">
        <!-- realistic soft contact shadow + ambient lighting integration -->
        <ellipse id="packshot-contact-shadow-wide" cx="${cx}" cy="${bottom + 4}" rx="190" ry="30" fill="#0F172A" fill-opacity="0.16" filter="url(#contact-shadow-wide)" />
        <ellipse id="packshot-contact-shadow-tight" cx="${cx}" cy="${bottom + 2}" rx="105" ry="14" fill="#0F172A" fill-opacity="0.34" filter="url(#contact-shadow-tight)" />
        <ellipse id="packshot-ambient-glow" cx="${cx}" cy="${packshotY + packshotH * 0.45}" rx="210" ry="320" fill="#FFFFFF" fill-opacity="0.10" filter="url(#contact-shadow-wide)" />
        <g id="packshot" data-packshot="true" filter="url(#rim-light)">
          <image data-packshot="true" href="${escapeXml(productUrl)}" x="${packshotX}" y="${packshotY}" width="${packshotW}" height="${packshotH}" preserveAspectRatio="xMidYMid meet" />
        </g>
      </g>
    `;
  }

  return `${packshot}${badges}`;
}

function salesCopyCard(width: number, text: string): string {
  // Sales Copy Elevated Card y=1330..1495, white rx=28, bold emerald #155E42 Cairo 800 48-54px
  const x = 86;
  const y = 1330;
  const w = width - 172;
  const h = 165;

  const words = text.trim().split(/\s+/).filter(Boolean);
  const { lines, charsPerLine } = wrapTextNoTruncate(text, 24, 2, 12);
  const size = Math.max(48, Math.min(54, 48 + Math.max(0, 22 - charsPerLine)));
  const lineHeight = Math.round(size * 1.3);
  const blockH = size + (lines.length - 1) * lineHeight;
  const textY = y + h / 2 - blockH / 2 + size - 2;
  void words;

  const tspans = lines
    .map((line, index) => `<tspan x="${width / 2}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`)
    .join("");

  return `
    <g id="sales-copy-card" filter="url(#card-shadow)">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="28" fill="#FFFFFF" />
      <rect x="${x + 1.5}" y="${y + 1.5}" width="${w - 3}" height="${h - 3}" rx="26.5" fill="#FFFFFF" stroke="#F1F5F9" stroke-width="1" />
      <text x="${width / 2}" y="${textY}" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="${size}" font-weight="800" fill="#155E42" text-anchor="middle" direction="rtl">${tspans}</text>
    </g>
  `;
}

function resolveAccent(theme?: string | null): string {
  const palette = BRAND.visual.primaryColors;
  switch ((theme ?? "").toLowerCase()) {
    case "amber":
      return palette.amber;
    case "rose":
      return "#E11D48";
    case "silver":
      return "#64748B";
    case "emerald":
    default:
      return palette.emerald;
  }
}

function occasionRibbon(width: number, occasion: OccasionGreetingInput): string {
  const ribbonWidth = Math.min(920, width - 120);
  const x = (width - ribbonWidth) / 2;
  const y = 208;
  const height = 48;
  const accent = resolveAccent(occasion.accentTheme);
  const text = wrapText(occasion.greeting, 52, 1)[0] ?? occasion.greeting;
  return `
    <g id="occasion-ribbon" transform="translate(${x}, ${y})">
      <rect width="${ribbonWidth}" height="${height}" rx="${height / 2}" fill="#FFFFFF" fill-opacity="0.96" stroke="${accent}" stroke-width="2" />
      <circle cx="28" cy="${height / 2}" r="7" fill="${accent}" />
      <text x="${ribbonWidth / 2}" y="32" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="21" font-weight="800" fill="#065F46" text-anchor="middle">${escapeXml(text)}</text>
    </g>
  `;
}

function formatPriceValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function promoBadge(width: number, y: number, promotion: ValidPromotion): string {
  const badgeWidth = Math.min(660, width - 140);
  const x = (width - badgeWidth) / 2;
  const height = 120;
  const currency = BRAND.commercial.currencyLabel;
  return `
    <g id="promo-badge" transform="translate(${x}, ${y})" filter="url(#card-shadow)">
      <rect width="${badgeWidth}" height="${height}" rx="24" fill="#FFFFFF" stroke="#F59E0B" stroke-width="2.5" />
      <g transform="translate(24, 34)">
        <rect width="160" height="46" rx="23" fill="#DC2626" />
        <text x="80" y="31" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="20" font-weight="900" fill="#FFFFFF" text-anchor="middle">خصم ${promotion.discountPercent}%</text>
      </g>
      <text x="${badgeWidth - 28}" y="74" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="44" font-weight="900" fill="#065F46" text-anchor="end">${escapeXml(formatPriceValue(promotion.promoPrice))} ${escapeXml(currency)}</text>
      <text x="24" y="98" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="20" font-weight="700" fill="#334155" fill-opacity="0.72" text-anchor="start" text-decoration="line-through">${escapeXml(formatPriceValue(promotion.originalPrice))} ${escapeXml(currency)}</text>
    </g>
  `;
}

function availabilityPill(width: number, y: number, text: string): string {
  const w = 360;
  const h = 54;
  const x = (width - w) / 2;
  return `
    <g id="availability-pill" transform="translate(${x}, ${y})" filter="url(#pill-shadow)">
      <rect width="${w}" height="${h}" rx="27" fill="#FFFFFF" fill-opacity="0.96" stroke="#059669" stroke-width="2" />
      <circle cx="32" cy="27" r="7" fill="#059669" />
      <text x="${w / 2 + 10}" y="35" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="22" font-weight="700" fill="#065F46" text-anchor="middle">${escapeXml(text)}</text>
    </g>
  `;
}

function ctaPill(width: number, y: number, text: string): string {
  const w = 500;
  const x = (width - w) / 2;
  return `
    <g transform="translate(${x}, ${y})" filter="url(#pill-shadow)">
      <rect width="${w}" height="70" rx="35" fill="#059669" />
      <text x="${w / 2}" y="45" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="28" font-weight="800" fill="#FFFFFF" text-anchor="middle">${escapeXml(text)}</text>
    </g>
  `;
}

function circularIcon(x: number, y: number, type: "phone" | "whatsapp"): string {
  const r = 28;
  if (type === "whatsapp") {
    return `
      <g transform="translate(${x}, ${y})">
        <circle cx="0" cy="0" r="${r}" fill="#059669" />
        <g transform="translate(-12,-12)">
          <path d="M17.2 14.2c-.3-.1-1.7-.8-1.9-.9-.3-.1-.5-.1-.7.1-.2.3-.8.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.4-2.3-1.4-.8-.7-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.1.2-.3.3-.4.1-.2 0-.3 0-.5-.1-.1-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.7.6.7.2 1.3.2 1.8.1.6-.1 1.7-.7 1.9-1.3.2-.6.2-1.2.2-1.3-.1-.1-.3-.2-.5-.3z" fill="#FFFFFF"/>
          <path d="M12 3.5a8.5 8.5 0 0 0-7.3 12.8L3.5 20.5l4.3-1.1A8.5 8.5 0 1 0 12 3.5z" fill="none" stroke="#FFFFFF" stroke-width="1.6"/>
        </g>
      </g>
    `;
  }
  return `
    <g transform="translate(${x}, ${y})">
      <circle cx="0" cy="0" r="${r}" fill="#059669" />
      <g transform="translate(-12,-12)" stroke="#FFFFFF" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.8 19.8 0 0 1 11.19 19a19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.63a2 2 0 0 1-.45 2.11L8 9.91a16 16 0 0 0 6 6l1.45-1.28a2 2 0 0 1 2.11-.45c.85.29 1.73.5 2.63.62A2 2 0 0 1 22 16.92z" fill="#FFFFFF" fill-opacity="0.08"/>
      </g>
    </g>
  `;
}

function contactBlock(width: number, height: number): string {
  // Bottom Contact Bar y=1730..1920
  const y = 1730;
  const barH = height - y;
  const phone = BRAND.contact.phone;
  return `
    <g id="contact-block">
      <rect x="0" y="${y}" width="${width}" height="${barH}" fill="#113D2E" />
      <text x="${width / 2 + 210}" y="${y + 78}" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="40" font-weight="700" fill="#FFFFFF" text-anchor="middle" direction="rtl">${escapeXml(CONTACT_LABEL)}</text>
      <g id="contact-row">
        ${circularIcon(width / 2 + 95, y + 122, "whatsapp")}
        <text x="${width / 2 - 40}" y="${y + 136}" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="52" font-weight="900" fill="#FFFFFF" text-anchor="middle" direction="ltr">${escapeXml(phone)}</text>
        ${circularIcon(width / 2 - 185, y + 122, "phone")}
      </g>
    </g>
  `;
}

export class OverlaySystem {
  public static generateOverlaySvg(opts: OverlayOptions = {}): string {
    const width = opts.width ?? BRAND.visual.format.width;
    const height = opts.height ?? BRAND.visual.format.height;
    const template = opts.template ?? "silver-podium-botanical";
    const headline = (opts.headline ?? "").trim();
    const benefit = (opts.benefitLine ?? "").trim();
    const cta = (opts.ctaText ?? "").trim();
    const availability = (opts.availabilityText ?? "").trim();
    const promotion = opts.promotion ?? null;
    const occasion = opts.occasion ?? null;
    const stagedImageUrl = opts.stagedImageUrl?.trim() || null;
    const productUrl = opts.productImageUrl?.trim() || null;

    const background =
      opts.background ??
      resolveBackground({
        width,
        height,
        template,
        sceneImageUrl: stagedImageUrl ?? opts.sceneImageUrl ?? null,
      });

    // Promo badge sits above sales copy card when active (keeps card position stable)
    const promoY = 1202;

    return `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" role="img" aria-label="${escapeXml(BRAND.brandName)}">
        ${commonDefs()}
        <g id="scene-background" data-template="${template}">${background.markup}</g>
        ${opts.showLogo === false ? "" : headerPill(width, opts.brandLogoUrl)}
        ${occasion ? occasionRibbon(width, occasion) : ""}
        ${productTitle(width, headline)}
        ${heroPackshot(width, productUrl, { staged: Boolean(stagedImageUrl) })}
        ${promotion ? promoBadge(width, promoY, promotion) : ""}
        ${benefit ? salesCopyCard(width, benefit) : ""}
        ${availability ? availabilityPill(width, 1518, availability) : ""}
        ${!promotion && cta ? ctaPill(width, 1510, cta) : ""}
        ${opts.showFooterBar === false ? "" : contactBlock(width, height)}
      </svg>
    `.trim();
  }
}
