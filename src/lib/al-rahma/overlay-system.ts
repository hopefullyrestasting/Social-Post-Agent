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
const SUBTITLE = "مستحضرات تجميل ومستلزمات الصيدليات - متاح توصيل";
const CONTACT_LABEL = "\u200Fللتواصل:";

function phoneIcon(x: number, y: number, color = "#065F46"): string {
  return `
    <g transform="translate(${x}, ${y})" stroke="${color}" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.8 19.8 0 0 1 11.19 19a19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.63a2 2 0 0 1-.45 2.11L8 9.91a16 16 0 0 0 6 6l1.45-1.28a2 2 0 0 1 2.11-.45c.85.29 1.73.5 2.63.62A2 2 0 0 1 22 16.92z" fill="#FFFFFF" fill-opacity="0.98"/>
      <path d="M14 2a6 6 0 0 1 6 6" />
      <path d="M14 6a2 2 0 0 1 2 2" />
    </g>
  `;
}

function whatsappIcon(x: number, y: number): string {
  return `
    <g transform="translate(${x}, ${y})">
      <circle cx="12" cy="12" r="11" fill="#25D366" />
      <path d="M17.2 14.2c-.3-.1-1.7-.8-1.9-.9-.3-.1-.5-.1-.7.1-.2.3-.8.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.4-2.3-1.4-.8-.7-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.1.2-.3.3-.4.1-.2 0-.3 0-.5-.1-.1-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.7.6.7.2 1.3.2 1.8.1.6-.1 1.7-.7 1.9-1.3.2-.6.2-1.2.2-1.3-.1-.1-.3-.2-.5-.3z" fill="#FFFFFF"/>
    </g>
  `;
}

function commonDefs(): string {
  return `
    <defs>
      <linearGradient id="header-glass" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#064E3B" stop-opacity="0.92" />
        <stop offset="100%" stop-color="#065F46" stop-opacity="0.88" />
      </linearGradient>
      <linearGradient id="headline-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#0B3D2E" />
        <stop offset="45%" stop-color="#0F172A" />
        <stop offset="100%" stop-color="#334155" />
      </linearGradient>
      <filter id="glass-blur" x="-10%" y="-20%" width="120%" height="140%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="0.2" />
      </filter>
      <filter id="soft-drop" x="-30%" y="-30%" width="160%" height="180%">
        <feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="#0F172A" flood-opacity="0.18" />
      </filter>
      <filter id="packshot-rim" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="0" stdDeviation="10" flood-color="#FFFFFF" flood-opacity="0.35" />
      </filter>
      <filter id="shadow-blur-strong" x="-40%" y="-160%" width="180%" height="420%">
        <feGaussianBlur stdDeviation="18" />
      </filter>
      <filter id="shadow-blur-soft" x="-40%" y="-160%" width="180%" height="420%">
        <feGaussianBlur stdDeviation="10" />
      </filter>
      <filter id="contact-shadow-tight" x="-40%" y="-160%" width="180%" height="420%">
        <feGaussianBlur stdDeviation="4" />
      </filter>
      <filter id="contact-shadow-wide" x="-40%" y="-160%" width="180%" height="420%">
        <feGaussianBlur stdDeviation="9" />
      </filter>
      <filter id="badge-drop" x="-30%" y="-30%" width="160%" height="180%">
        <feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#0F172A" flood-opacity="0.12" />
      </filter>
    </defs>
  `;
}

function brandHeader(width: number, brandLogoUrl?: string | null): string {
  // Top header y = 60..210
  const y = 60;
  const h = 150;
  const w = 940;
  const x = (width - w) / 2;
  const logo = brandLogoUrl?.trim() || null;

  const badge = logo
    ? `<image href="${escapeXml(logo)}" x="18" y="20" width="110" height="110" preserveAspectRatio="xMidYMid meet" />
       <rect x="18" y="20" width="110" height="110" rx="22" fill="none" stroke="#A7F3D0" stroke-width="2" />`
    : `<circle cx="73" cy="75" r="38" fill="#059669" />
       <path d="M52 75 L67 90 L94 58" fill="none" stroke="#FFFFFF" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />`;

  return `
    <g id="brand-header" transform="translate(${x}, ${y})">
      <rect width="${w}" height="${h}" rx="30" fill="url(#header-glass)" />
      <rect width="${w}" height="${h}" rx="30" fill="#FFFFFF" fill-opacity="0.08" />
      <rect width="${w}" height="${h}" rx="30" fill="none" stroke="#D1FAE5" stroke-opacity="0.35" stroke-width="1.5" />
      ${badge}
      <text x="148" y="62" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="42" font-weight="800" fill="#FFFFFF" text-anchor="start">${escapeXml(BRAND.brandName)}</text>
      <text x="${w / 2}" y="118" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="28" font-weight="700" fill="#ECFDF5" text-anchor="middle">${escapeXml(SUBTITLE)}</text>
    </g>
  `;
}

function textBlockTspans(
  lines: string[],
  options: {
    x: number;
    y: number;
    size: number;
    fill: string;
    weight?: number;
    anchor?: "start" | "middle" | "end";
    lineHeight?: number;
  },
): string {
  const {
    x,
    y,
    size,
    fill,
    weight = 700,
    anchor = "middle",
    lineHeight = Math.round(size * 1.32),
  } = options;
  if (lines.length === 0) return "";
  const tspans = lines
    .map(
      (line, index) =>
        `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`,
    )
    .join("");
  return `<text x="${x}" y="${y}" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" direction="rtl">${tspans}</text>`;
}

function heroHeadline(width: number, headline: string): string {
  // Hero headline y = 260..410, max 2 lines, 48-54px, no truncation
  const x = width / 2;
  const { lines, charsPerLine } = wrapTextNoTruncate(headline, 24, 2, 12);
  const size = Math.max(48, Math.min(54, 48 + Math.max(0, 24 - charsPerLine)));
  const lineHeight = Math.round(size * 1.32);
  const blockH = size + (lines.length - 1) * lineHeight;
  const top = 270;
  const bottomLimit = 400;
  const y = Math.min(top + size, bottomLimit - Math.max(0, blockH - size));
  return textBlockTspans(lines, {
    x,
    y,
    size,
    fill: "url(#headline-gradient)",
    weight: 800,
    anchor: "middle",
    lineHeight,
  });
}

function podiumAndPackshot(
  width: number,
  productUrl: string | null | undefined,
): string {
  const cx = width / 2;
  const podiumTopY = 1285;
  const podiumBottomY = 1400;
  const podiumW = 760;
  const podiumX = (width - podiumW) / 2;
  const packshotH = 670;
  const packshotBottom = 1355;
  const packshotY = packshotBottom - packshotH; // 685
  const packshotW = 560;
  const packshotX = (width - packshotW) / 2;

  const podium = `
    <g id="studio-podium">
      <ellipse cx="${cx}" cy="${podiumBottomY + 30}" rx="420" ry="54" fill="#0F172A" fill-opacity="0.18" filter="url(#shadow-blur-strong)" />
      <ellipse cx="${cx}" cy="${podiumTopY + 78}" rx="360" ry="44" fill="#334155" fill-opacity="0.18" filter="url(#shadow-blur-soft)" />
      <path d="M ${podiumX} ${podiumTopY} L ${podiumX + podiumW} ${podiumTopY} L ${podiumX + podiumW - 70} ${podiumBottomY} L ${podiumX + 70} ${podiumBottomY} Z" fill="url(#podium-front)" opacity="0.98" />
      <ellipse cx="${cx}" cy="${podiumTopY}" rx="${podiumW / 2}" ry="34" fill="url(#podium-surface)" />
      <ellipse cx="${cx}" cy="${podiumTopY - 2}" rx="${podiumW / 2 - 10}" ry="24" fill="#FFFFFF" fill-opacity="0.45" />
      <ellipse cx="${cx}" cy="${podiumTopY + 56}" rx="${podiumW / 2 - 60}" ry="18" fill="#FFFFFF" fill-opacity="0.10" />
    </g>
  `;

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
        <ellipse id="packshot-rim-glow" cx="${cx}" cy="${packshotY + packshotH * 0.45}" rx="210" ry="300" fill="#FFFFFF" fill-opacity="0.18" filter="url(#packshot-rim)" />
        <!-- wide soft ambient shadow across podium top -->
        <ellipse id="packshot-contact-shadow-wide" cx="${cx}" cy="${packshotBottom - 2}" rx="190" ry="28" fill="#0F172A" fill-opacity="0.18" filter="url(#contact-shadow-wide)" />
        <!-- tight dark contact shadow at bottle base -->
        <ellipse id="packshot-contact-shadow-tight" cx="${cx}" cy="${packshotBottom - 2}" rx="110" ry="14" fill="#0F172A" fill-opacity="0.42" filter="url(#contact-shadow-tight)" />
        <g id="packshot" data-packshot="true" filter="url(#soft-drop)">
          <image data-packshot="true" href="${escapeXml(productUrl)}" x="${packshotX}" y="${packshotY}" width="${packshotW}" height="${packshotH}" preserveAspectRatio="xMidYMid meet" />
        </g>
      </g>
    `;
  }

  // Side frosted-glass benefit badges (agency-grade)
  const badge = (x: number, y: number, label: string, align: "start" | "end") => {
    const w = 258;
    const h = 62;
    const bx = align === "end" ? x - w : x;
    const iconCx = align === "end" ? w - 30 : 30;
    const iconX = iconCx - 6;
    const iconY = h / 2 - 2;
    const stroke = align === "start" ? "#059669" : "#94A3B8";
    return `
      <g transform="translate(${bx}, ${y})" filter="url(#badge-drop)">
        <rect width="${w}" height="${h}" rx="31" fill="rgba(255,255,255,0.88)" stroke="${stroke}" stroke-width="1.5" />
        <rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="29.5" fill="#FFFFFF" fill-opacity="0.18" />
        <circle cx="${iconCx}" cy="${h / 2}" r="11" fill="#059669" fill-opacity="0.12" stroke="#059669" stroke-width="1.2" />
        <path d="M ${iconX} ${iconY} l 4 4 l 8 -9" fill="none" stroke="#059669" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
        <text x="${w / 2 + (align === "end" ? -8 : 8)}" y="39" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="22" font-weight="700" fill="#065F46" text-anchor="middle">${escapeXml(label)}</text>
      </g>
    `;
  };

  const badges = `
    <g id="benefit-badges">
      ${badge(70, 820, "تركيبة طبيعية", "start")}
      ${badge(width - 70, 900, "جودة مضمونة", "end")}
    </g>
  `;

  return `${podium}${packshot}${badges}`;
}

function salesCopyGlassCard(width: number, text: string, hasPromo: boolean): string {
  // Sales copy glass card y ~ 1430..1560
  const y = hasPromo ? 1505 : 1435;
  const h = 110;
  const w = 860;
  const x = (width - w) / 2;
  const { lines } = wrapTextNoTruncate(text, 28, 2, 14);
  const fontSize = lines.length > 1 ? 38 : 42;
  const lineHeight = Math.round(fontSize * 1.3);
  const firstY = lines.length > 1 ? y + 48 : y + 64;

  return `
    <g id="sales-copy-card" filter="url(#soft-drop)">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="30" fill="#FFFFFF" fill-opacity="0.78" />
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="30" fill="#F8FAFC" fill-opacity="0.35" />
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="30" fill="none" stroke="#E2E8F0" stroke-opacity="0.9" stroke-width="1.5" />
      ${textBlockTspans(lines, {
        x: width / 2,
        y: firstY,
        size: fontSize,
        fill: "#065F46",
        weight: 800,
        anchor: "middle",
        lineHeight,
      })}
    </g>
  `;
}

function availabilityPill(width: number, y: number, text: string): string {
  const w = 360;
  const h = 56;
  const x = (width - w) / 2;
  return `
    <g id="availability-pill" transform="translate(${x}, ${y})">
      <rect width="${w}" height="${h}" rx="28" fill="#FFFFFF" fill-opacity="0.96" stroke="#059669" stroke-width="2" />
      <circle cx="34" cy="28" r="8" fill="#059669" />
      <text x="58" y="36" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="23" font-weight="700" fill="#065F46" text-anchor="start">${escapeXml(text)}</text>
    </g>
  `;
}

function ctaPill(width: number, y: number, text: string): string {
  const w = 520;
  const x = (width - w) / 2;
  return `
    <g transform="translate(${x}, ${y})">
      <rect width="${w}" height="74" rx="37" fill="#059669" />
      <text x="${w / 2}" y="48" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="30" font-weight="800" fill="#FFFFFF" text-anchor="middle">${escapeXml(text)}</text>
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
  const ribbonWidth = Math.min(920, width - 80);
  const x = (width - ribbonWidth) / 2;
  const y = 218;
  const height = 54;
  const accent = resolveAccent(occasion.accentTheme);
  const text = wrapText(occasion.greeting, 52, 1)[0] ?? occasion.greeting;
  return `
    <g id="occasion-ribbon" transform="translate(${x}, ${y})">
      <rect width="${ribbonWidth}" height="${height}" rx="${height / 2}" fill="#FFFFFF" fill-opacity="0.96" stroke="${accent}" stroke-width="2" />
      <circle cx="32" cy="${height / 2}" r="8" fill="${accent}" />
      <text x="${ribbonWidth / 2}" y="36" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="22" font-weight="800" fill="#065F46" text-anchor="middle">${escapeXml(text)}</text>
    </g>
  `;
}

function formatPriceValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function promoBadge(width: number, y: number, promotion: ValidPromotion): string {
  const badgeWidth = Math.min(660, width - 96);
  const x = (width - badgeWidth) / 2;
  const height = 150;
  const currency = BRAND.commercial.currencyLabel;
  return `
    <g id="promo-badge" transform="translate(${x}, ${y})">
      <rect width="${badgeWidth}" height="${height}" rx="28" fill="#FFFFFF" stroke="#F59E0B" stroke-width="2.5" />
      <g transform="translate(28, 24)">
        <rect width="176" height="52" rx="26" fill="#DC2626" />
        <text x="88" y="34" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="22" font-weight="900" fill="#FFFFFF" text-anchor="middle">خصم ${promotion.discountPercent}%</text>
      </g>
      <text x="${badgeWidth - 30}" y="92" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="50" font-weight="900" fill="#065F46" text-anchor="end">${escapeXml(formatPriceValue(promotion.promoPrice))} ${escapeXml(currency)}</text>
      <text x="28" y="106" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="22" font-weight="700" fill="#334155" fill-opacity="0.75" text-anchor="start" text-decoration="line-through">${escapeXml(formatPriceValue(promotion.originalPrice))} ${escapeXml(currency)}</text>
    </g>
  `;
}

function contactBlock(width: number, height: number): string {
  // Bottom contact bar y = 1710..1920
  const y = 1710;
  const barH = height - y;
  const phone = BRAND.contact.phone;
  return `
    <g id="contact-block">
      <rect x="0" y="${y}" width="${width}" height="${barH}" fill="#065F46" />
      <rect x="0" y="${y}" width="${width}" height="6" fill="#059669" />
      <text x="${width / 2}" y="${y + 54}" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="38" font-weight="800" fill="#FFFFFF" text-anchor="middle" direction="rtl">${escapeXml(CONTACT_LABEL)}</text>
      <g id="contact-pill" transform="translate(${width / 2 - 290}, ${y + 78})">
        <rect x="0" y="0" width="580" height="86" rx="43" fill="#FFFFFF" fill-opacity="0.98" />
        ${phoneIcon(34, 28, "#065F46")}
        <text x="290" y="56" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="48" font-weight="900" fill="#0F172A" text-anchor="middle" direction="ltr">${escapeXml(phone)}</text>
        ${whatsappIcon(516, 31)}
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
    const productUrl = opts.productImageUrl?.trim() || null;

    const background =
      opts.background ??
      resolveBackground({
        width,
        height,
        template,
        sceneImageUrl: opts.sceneImageUrl ?? null,
      });

    const promoY = 1365;
    const salesHasPromo = Boolean(promotion);
    const availY = salesHasPromo ? 1665 : 1575;
    const ctaY = 1645;

    return `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" role="img" aria-label="${escapeXml(BRAND.brandName)}">
        ${commonDefs()}
        <g id="scene-background" data-template="${template}">${background.markup}</g>
        ${opts.showLogo === false ? "" : brandHeader(width, opts.brandLogoUrl)}
        ${occasion ? occasionRibbon(width, occasion) : ""}
        ${heroHeadline(width, headline)}
        ${podiumAndPackshot(width, productUrl)}
        ${promotion ? promoBadge(width, promoY, promotion) : ""}
        ${benefit ? salesCopyGlassCard(width, benefit, salesHasPromo) : ""}
        ${availability ? availabilityPill(width, availY, availability) : ""}
        ${!salesHasPromo && cta ? ctaPill(width, ctaY, cta) : ""}
        ${opts.showFooterBar === false ? "" : contactBlock(width, height)}
      </svg>
    `.trim();
  }
}
