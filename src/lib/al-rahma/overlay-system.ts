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
      <filter id="editorial-text-shadow" x="-20%" y="-40%" width="140%" height="180%">
        <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#0F172A" flood-opacity="0.28" />
        <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="#0F172A" flood-opacity="0.22" />
      </filter>
      <linearGradient id="bottom-editorial-vignette" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#0F172A" stop-opacity="0" />
        <stop offset="35%" stop-color="#0F172A" stop-opacity="0.10" />
        <stop offset="70%" stop-color="#0F172A" stop-opacity="0.30" />
        <stop offset="100%" stop-color="#0F172A" stop-opacity="0.46" />
      </linearGradient>
    </defs>
  `;
}

function headerPill(width: number, brandLogoUrl?: string | null): string {
  // Sleek top header y=44..184
  void width;
  const x = 40;
  const y = 44;
  const w = 1000;
  const h = 140;
  const logo = brandLogoUrl?.trim() || null;

  const logoX = 916;
  const logoY = 66;
  const logoSize = 96;
  const brandX = 896;
  const brandY = 128;
  const dividerX = 685;
  const dividerY1 = 72;
  const dividerY2 = 156;
  const taglineX = 660;
  const taglineY = 126;

  const logoNode = logo
    ? `<image href="${escapeXml(logo)}" x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet" />
       <rect x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" rx="22" fill="#FFFFFF" fill-opacity="0.10" stroke="#FFFFFF" stroke-opacity="0.18" />`
    : `<rect x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" rx="22" fill="#FFFFFF" fill-opacity="0.12" stroke="#FFFFFF" stroke-opacity="0.18" />
       <circle cx="${logoX + logoSize / 2}" cy="${logoY + logoSize / 2}" r="26" fill="#059669" />
       <path d="M ${logoX + 34} ${logoY + 50} L ${logoX + 45} ${logoY + 62} L ${logoX + 64} ${logoY + 38}" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />`;

  return `
    <g id="top-header-pill">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="34" fill="#0F3D2E" />
      ${logoNode}
      <text x="${brandX}" y="${brandY}" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="38" font-weight="900" fill="#FFFFFF" text-anchor="end">${escapeXml(BRAND.brandName)}</text>
      <line id="header-divider" x1="${dividerX}" y1="${dividerY1}" x2="${dividerX}" y2="${dividerY2}" stroke="rgba(255,255,255,0.35)" stroke-width="2" />
      <text x="${taglineX}" y="${taglineY}" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="25" font-weight="700" fill="#E2E8F0" text-anchor="end">${escapeXml(HEADER_ACTIVITY)}</text>
    </g>
  `;
}

function productTitle(width: number, headline: string): string {
  // Product Name y=220..375, Cairo 900, 54-60px, max 2 lines, zero ellipsis
  const x = width / 2;
  const { lines, charsPerLine } = wrapTextNoTruncate(headline, 22, 2, 10);
  const size = Math.max(54, Math.min(60, 54 + Math.max(0, 20 - charsPerLine)));
  const lineHeight = Math.round(size * 1.26);
  const blockH = size + (lines.length - 1) * lineHeight;
  const top = 220 + size;
  const bottom = 375;
  const y = Math.min(top, bottom - Math.max(0, blockH - size));

  const tspans = lines
    .map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`)
    .join("");
  return `
    <g id="product-title">
      <text x="${x}" y="${y}" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="${size}" font-weight="900" fill="#1F2937" text-anchor="middle" direction="rtl">${tspans}</text>
    </g>
  `;
}

function heroPackshot(
  width: number,
  productUrl: string | null | undefined,
  options?: { staged?: boolean },
): string {
  // When a full staged image (background+product) is provided, do not duplicate the bottle.
  if (options?.staged) {
    return "";
  }

  // Dominant hero packshot: 860x680 at x=200,y=400, bottom at 1260
  const cx = width / 2;
  const packshotX = 200;
  const packshotY = 400;
  const packshotW = 680;
  const packshotH = 860;
  const bottom = 1260;

  if (!productUrl) {
    return `
      <g id="packshot-missing">
        <rect x="${packshotX}" y="${packshotY}" width="${packshotW}" height="${packshotH}" rx="28" fill="none" stroke="#94A3B8" stroke-width="3" stroke-dasharray="14 12" />
        <text x="${cx}" y="${packshotY + packshotH / 2}" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="30" font-weight="700" fill="#64748B" text-anchor="middle">الصورة الأصلية غير متاحة</text>
      </g>
    `;
  }

  return `
    <g id="packshot-hero">
      <ellipse id="packshot-contact-shadow-wide" cx="${cx}" cy="${bottom + 6}" rx="230" ry="34" fill="#0F172A" fill-opacity="0.16" filter="url(#contact-shadow-wide)" />
      <ellipse id="packshot-contact-shadow-tight" cx="${cx}" cy="${bottom + 2}" rx="125" ry="16" fill="#0F172A" fill-opacity="0.34" filter="url(#contact-shadow-tight)" />
      <ellipse id="packshot-ambient-glow" cx="${cx}" cy="${packshotY + packshotH * 0.45}" rx="250" ry="360" fill="#FFFFFF" fill-opacity="0.08" filter="url(#contact-shadow-wide)" />
      <g id="packshot" data-packshot="true" filter="url(#rim-light)">
        <image data-packshot="true" href="${escapeXml(productUrl)}" x="${packshotX}" y="${packshotY}" width="${packshotW}" height="${packshotH}" preserveAspectRatio="xMidYMid meet" />
      </g>
    </g>
  `;
}

function editorialSalesCopy(width: number, height: number, text: string): string {
  // High-impact editorial sales copy y=1330..1530, direct on photography with subtle vignette/scrim (no white box)
  const x = width / 2;
  const size = 54;
  const lineHeight = 64;
  const { lines } = wrapTextNoTruncate(text, 22, 2, 10);
  const blockH = size + (lines.length - 1) * lineHeight;
  const top = 1330 + size;
  const bottom = 1530;
  const y = Math.min(top, bottom - Math.max(0, blockH - size));
  const tspans = lines
    .map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`)
    .join("");

  return `
    <g id="sales-copy-editorial">
      <rect x="0" y="${Math.max(0, height - 760)}" width="${width}" height="760" fill="url(#bottom-editorial-vignette)" />
      <text x="${x}" y="${y}" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="${size}" font-weight="900" fill="#FFFFFF" text-anchor="middle" direction="rtl" filter="url(#editorial-text-shadow)">${tspans}</text>
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
  const w = 480;
  const h = 80;
  const x = (width - w) / 2;
  return `
    <g id="cta-pill" transform="translate(${x}, ${y})" filter="url(#pill-shadow)">
      <rect width="${w}" height="${h}" rx="${h / 2}" fill="#059669" />
      <text x="${w / 2}" y="51" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="30" font-weight="800" fill="#FFFFFF" text-anchor="middle">${escapeXml(text)}</text>
    </g>
  `;
}

function circularIcon(cx: number, cy: number, type: "phone" | "whatsapp"): string {
  const r = 30;
  if (type === "whatsapp") {
    return `
      <g>
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="#059669" />
        <g transform="translate(${cx - 12},${cy - 12})">
          <path d="M17.2 14.2c-.3-.1-1.7-.8-1.9-.9-.3-.1-.5-.1-.7.1-.2.3-.8.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.4-2.3-1.4-.8-.7-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.1.2-.3.3-.4.1-.2 0-.3 0-.5-.1-.1-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.7.6.7.2 1.3.2 1.8.1.6-.1 1.7-.7 1.9-1.3.2-.6.2-1.2.2-1.3-.1-.1-.3-.2-.5-.3z" fill="#FFFFFF"/>
          <path d="M12 3.5a8.5 8.5 0 0 0-7.3 12.8L3.5 20.5l4.3-1.1A8.5 8.5 0 1 0 12 3.5z" fill="none" stroke="#FFFFFF" stroke-width="1.6"/>
        </g>
      </g>
    `;
  }
  return `
    <g>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="#059669" />
      <g transform="translate(${cx - 12},${cy - 12})" stroke="#FFFFFF" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.8 19.8 0 0 1 11.19 19a19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.63a2 2 0 0 1-.45 2.11L8 9.91a16 16 0 0 0 6 6l1.45-1.28a2 2 0 0 1 2.11-.45c.85.29 1.73.5 2.63.62A2 2 0 0 1 22 16.92z" fill="#FFFFFF" fill-opacity="0.08"/>
      </g>
    </g>
  `;
}

function contactBlock(width: number): string {
  // Full-width dark-emerald footer x=0, y=1730, w=1080, h=190
  const y = 1730;
  const barH = 190;
  const phone = BRAND.contact.phone;
  return `
    <g id="contact-block">
      <rect x="0" y="${y}" width="${width}" height="${barH}" fill="#0F3D2E" />
      <text x="960" y="1840" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="42" font-weight="800" fill="#FFFFFF" text-anchor="end" direction="rtl">${escapeXml(CONTACT_LABEL)}</text>
      <text x="540" y="1842" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="52" font-weight="900" fill="#FFFFFF" text-anchor="middle" direction="ltr">${escapeXml(phone)}</text>
      ${circularIcon(250, 1825, "whatsapp")}
      ${circularIcon(165, 1825, "phone")}
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

    // Keep promo badge clear of hero/sales area in the editorial layout.
    const promoY = 1180;

    return `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" role="img" aria-label="${escapeXml(BRAND.brandName)}">
        ${commonDefs()}
        <g id="scene-background" data-template="${template}">${background.markup}</g>
        ${opts.showLogo === false ? "" : headerPill(width, opts.brandLogoUrl)}
        ${occasion ? occasionRibbon(width, occasion) : ""}
        ${productTitle(width, headline)}
        ${heroPackshot(width, productUrl, { staged: Boolean(stagedImageUrl) })}
        ${promotion ? promoBadge(width, promoY, promotion) : ""}
        ${benefit ? editorialSalesCopy(width, height, benefit) : ""}
        ${availability ? availabilityPill(width, 1542, availability) : ""}
        ${!promotion && cta ? ctaPill(width, 1575, cta) : ""}
        ${opts.showFooterBar === false ? "" : contactBlock(width)}
      </svg>
    `.trim();
  }
}
