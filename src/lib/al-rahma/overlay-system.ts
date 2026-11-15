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
const ACTIVITY_TEXT = "مستحضرات تجميل ومستلزمات الصيدليات";
const DELIVERY_TEXT = "متاح توصيل";
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

function deliveryIcon(x: number, y: number): string {
  return `
    <g transform="translate(${x}, ${y})" fill="none" stroke="#065F46" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M1 6h13v8H1z" fill="#ECFDF5" stroke="#065F46"/>
      <path d="M14 8h5l3 3v3h-8z" fill="#ECFDF5" stroke="#065F46"/>
      <circle cx="5" cy="16" r="2" fill="#FFFFFF"/>
      <circle cx="17" cy="16" r="2" fill="#FFFFFF"/>
      <path d="M6 2l2 2 4-4" stroke="#047857" stroke-width="2.4"/>
    </g>
  `;
}

function commonDefs(): string {
  return `
    <defs>
      <linearGradient id="header-glass" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.72" />
        <stop offset="100%" stop-color="#F8FAFC" stop-opacity="0.58" />
      </linearGradient>
      <linearGradient id="delivery-pill" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#ECFDF5" />
        <stop offset="50%" stop-color="#FEF3C7" />
        <stop offset="100%" stop-color="#ECFDF5" />
      </linearGradient>
      <linearGradient id="headline-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#0B3D2E" />
        <stop offset="45%" stop-color="#0F172A" />
        <stop offset="100%" stop-color="#334155" />
      </linearGradient>
      <linearGradient id="podium-surface-hero" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#FFFFFF" />
        <stop offset="55%" stop-color="#F1F5F9" />
        <stop offset="100%" stop-color="#CBD5E1" />
      </linearGradient>
      <linearGradient id="podium-front-hero" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#E2E8F0" />
        <stop offset="35%" stop-color="#CBD5E1" />
        <stop offset="100%" stop-color="#94A3B8" />
      </linearGradient>
      <filter id="soft-drop" x="-30%" y="-30%" width="160%" height="180%">
        <feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="#0F172A" flood-opacity="0.18" />
      </filter>
      <filter id="packshot-rim" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="0" stdDeviation="12" flood-color="#FFFFFF" flood-opacity="0.38" />
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
  // Header Lockup y=45..205 (balanced 3-part RTL lockup)
  const x = 40;
  const y = 45;
  const w = width - 80;
  const h = 160;
  const logo = brandLogoUrl?.trim() || null;

  const logoBadgeX = w - 20 - 120; // right side inside header
  const logoBadge = logo
    ? `<image href="${escapeXml(logo)}" x="${logoBadgeX + 10}" y="20" width="100" height="100" preserveAspectRatio="xMidYMid meet" />
       <rect x="${logoBadgeX}" y="10" width="120" height="120" rx="28" fill="#FFFFFF" fill-opacity="0.82" stroke="#D1FAE5" stroke-width="1.8" />`
    : `<rect x="${logoBadgeX}" y="10" width="120" height="120" rx="28" fill="#FFFFFF" fill-opacity="0.82" stroke="#D1FAE5" stroke-width="1.8" />
       <circle cx="${logoBadgeX + 60}" cy="70" r="34" fill="#059669" />
       <path d="M ${logoBadgeX + 42} 70 L ${logoBadgeX + 55} 84 L ${logoBadgeX + 80} 54" fill="none" stroke="#FFFFFF" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />`;

  const deliveryPillW = 250;
  const deliveryPillH = 68;
  const deliveryPillX = 20;
  const deliveryPillY = 46;
  const deliveryPill = `
    <g id="delivery-pill" transform="translate(${deliveryPillX}, ${deliveryPillY})">
      <rect width="${deliveryPillW}" height="${deliveryPillH}" rx="34" fill="url(#delivery-pill)" stroke="#D97706" stroke-opacity="0.45" stroke-width="1.5" />
      <rect x="1.5" y="1.5" width="${deliveryPillW - 3}" height="${deliveryPillH - 3}" rx="32.5" fill="#FFFFFF" fill-opacity="0.22" />
      ${deliveryIcon(18, 24)}
      <text x="148" y="43" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="26" font-weight="800" fill="#065F46" text-anchor="middle">${escapeXml(DELIVERY_TEXT)}</text>
    </g>
  `;

  return `
    <g id="brand-header-lockup" transform="translate(${x}, ${y})">
      <rect width="${w}" height="${h}" rx="32" fill="url(#header-glass)" stroke="#E2E8F0" stroke-opacity="0.9" stroke-width="1.5" />
      ${logoBadge}
      <g id="brand-center" text-anchor="middle">
        <text x="${w / 2}" y="72" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="44" font-weight="800" fill="#0F172A">${escapeXml(BRAND.brandName)}</text>
        <text x="${w / 2}" y="114" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="24" font-weight="700" fill="#334155">${escapeXml(ACTIVITY_TEXT)}</text>
      </g>
      ${deliveryPill}
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

function productNameTitle(width: number, headline: string): string {
  // Product Name y=235..365, 44-48px Cairo Bold, dark slate #0F172A, max 2 lines, zero ellipsis
  const x = width / 2;
  const { lines, charsPerLine } = wrapTextNoTruncate(headline, 26, 2, 12);
  const size = Math.max(44, Math.min(48, 44 + Math.max(0, 24 - charsPerLine)));
  const lineHeight = Math.round(size * 1.32);
  const blockH = size + (lines.length - 1) * lineHeight;
  const top = 245;
  const bottomLimit = 355;
  const y = Math.min(top + size, bottomLimit - Math.max(0, blockH - size));
  return `<g id="product-name">${textBlockTspans(lines, {
    x,
    y,
    size,
    fill: "#0F172A",
    weight: 800,
    anchor: "middle",
    lineHeight,
  })}</g>`;
}

function podiumAndPackshot(
  width: number,
  productUrl: string | null | undefined,
): string {
  // Dominant Hero Stage y=390..1190: 760px packshot (x220,y410,w640,h760, bottom 1170)
  // on crisp 3D architectural podium y~1140..1215
  const cx = width / 2;
  const packshotX = 220;
  const packshotY = 410;
  const packshotW = 640;
  const packshotH = 760;
  const packshotBottom = 1170;
  const podiumTopY = 1145;
  const podiumBottomY = 1215;
  const podiumW = 780;
  const podiumX = (width - podiumW) / 2;

  const podium = `
    <g id="studio-podium">
      <ellipse cx="${cx}" cy="${podiumBottomY + 32}" rx="430" ry="54" fill="#0F172A" fill-opacity="0.16" filter="url(#shadow-blur-strong)" />
      <ellipse cx="${cx}" cy="${podiumTopY + 56}" rx="360" ry="40" fill="#334155" fill-opacity="0.14" filter="url(#shadow-blur-soft)" />
      <path d="M ${podiumX} ${podiumTopY} L ${podiumX + podiumW} ${podiumTopY} L ${podiumX + podiumW - 70} ${podiumBottomY} L ${podiumX + 70} ${podiumBottomY} Z" fill="url(#podium-front-hero)" opacity="0.98" />
      <ellipse cx="${cx}" cy="${podiumTopY}" rx="${podiumW / 2}" ry="34" fill="url(#podium-surface-hero)" />
      <ellipse cx="${cx}" cy="${podiumTopY - 2}" rx="${podiumW / 2 - 12}" ry="24" fill="#FFFFFF" fill-opacity="0.5" />
      <ellipse cx="${cx}" cy="${podiumTopY + 2}" rx="${podiumW / 2 - 28}" ry="14" fill="#FFFFFF" fill-opacity="0.22" />
      <line x1="${podiumX + 16}" y1="${podiumTopY + 4}" x2="${podiumX + podiumW - 16}" y2="${podiumTopY + 4}" stroke="#FFFFFF" stroke-opacity="0.55" stroke-width="2" />
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
        <ellipse id="packshot-rim-glow" cx="${cx}" cy="${packshotY + packshotH * 0.45}" rx="230" ry="340" fill="#FFFFFF" fill-opacity="0.18" filter="url(#packshot-rim)" />
        <!-- wide soft ambient shadow -->
        <ellipse id="packshot-contact-shadow-wide" cx="${cx}" cy="${packshotBottom - 2}" rx="190" ry="28" fill="#0F172A" fill-opacity="0.18" filter="url(#contact-shadow-wide)" />
        <!-- tight dark contact shadow -->
        <ellipse id="packshot-contact-shadow-tight" cx="${cx}" cy="${packshotBottom - 2}" rx="110" ry="14" fill="#0F172A" fill-opacity="0.42" filter="url(#contact-shadow-tight)" />
        <g id="packshot" data-packshot="true" filter="url(#soft-drop)">
          <image data-packshot="true" href="${escapeXml(productUrl)}" x="${packshotX}" y="${packshotY}" width="${packshotW}" height="${packshotH}" preserveAspectRatio="xMidYMid meet" />
        </g>
      </g>
    `;
  }

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
      ${badge(60, 760, "تركيبة طبيعية", "start")}
      ${badge(width - 60, 840, "جودة مضمونة", "end")}
    </g>
  `;

  return `${podium}${packshot}${badges}`;
}

function highImpactSalesTypography(width: number, text: string): string {
  // High-impact sales copy y~1245..1540, ~60px Cairo Black/ExtraBold, no cramped box,
  // dual-tone: first half of benefit words emerald #047857, remainder deep charcoal #1E293B,
  // framed by subtle geometric accent bars.
  const { lines } = wrapTextNoTruncate(text, 22, 2, 12);
  const words = text.trim().split(/\s+/).filter(Boolean);
  const primaryCount = Math.max(1, Math.ceil(words.length / 2));

  const fontSize = 60;
  const lineHeight = Math.round(fontSize * 1.28);
  const topY = 1275;
  const centerX = width / 2;

  let consumed = 0;
  const tspansLines = lines
    .map((line, lineIndex) => {
      const lineWords = line.split(/\s+/).filter(Boolean);
      const pieces = lineWords.map((w, i) => {
        const fill = consumed < primaryCount ? "#047857" : "#1E293B";
        consumed += 1;
        const space = i < lineWords.length - 1 ? " " : "";
        return `<tspan fill="${fill}">${escapeXml(w + space)}</tspan>`;
      });
      const dy = lineIndex === 0 ? 0 : lineHeight;
      return `<tspan x="${centerX}" dy="${dy}">${pieces.join("")}</tspan>`;
    })
    .join("");

  const barYTop = topY - fontSize - 18;
  const barYBottom = topY + (lines.length - 1) * lineHeight + 28;

  return `
    <g id="sales-copy-impact">
      <rect x="${centerX - 220}" y="${barYTop}" width="440" height="4" rx="2" fill="#047857" fill-opacity="0.18" />
      <rect x="${centerX - 160}" y="${barYTop + 10}" width="320" height="2" rx="1" fill="#0F172A" fill-opacity="0.10" />
      <text x="${centerX}" y="${topY}" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="${fontSize}" font-weight="900" text-anchor="middle" direction="rtl">${tspansLines}</text>
      <rect x="${centerX - 220}" y="${barYBottom}" width="440" height="4" rx="2" fill="#047857" fill-opacity="0.18" />
      <rect x="${centerX - 160}" y="${barYBottom - 8}" width="320" height="2" rx="1" fill="#0F172A" fill-opacity="0.10" />
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
  const y = 214;
  const height = 52;
  const accent = resolveAccent(occasion.accentTheme);
  const text = wrapText(occasion.greeting, 52, 1)[0] ?? occasion.greeting;
  return `
    <g id="occasion-ribbon" transform="translate(${x}, ${y})">
      <rect width="${ribbonWidth}" height="${height}" rx="${height / 2}" fill="#FFFFFF" fill-opacity="0.96" stroke="${accent}" stroke-width="2" />
      <circle cx="32" cy="${height / 2}" r="8" fill="${accent}" />
      <text x="${ribbonWidth / 2}" y="35" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="22" font-weight="800" fill="#065F46" text-anchor="middle">${escapeXml(text)}</text>
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
  // Contact footer y=1690..1920
  const y = 1690;
  const barH = height - y;
  const phone = BRAND.contact.phone;
  return `
    <g id="contact-block">
      <rect x="0" y="${y}" width="${width}" height="${barH}" fill="#065F46" />
      <rect x="0" y="${y}" width="${width}" height="6" fill="#059669" />
      <text x="${width / 2}" y="${y + 58}" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="38" font-weight="800" fill="#FFFFFF" text-anchor="middle" direction="rtl">${escapeXml(CONTACT_LABEL)}</text>
      <g id="contact-pill" transform="translate(${width / 2 - 290}, ${y + 84})">
        <rect x="0" y="0" width="580" height="90" rx="45" fill="#FFFFFF" fill-opacity="0.98" />
        ${phoneIcon(34, 30, "#065F46")}
        <text x="290" y="58" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="48" font-weight="900" fill="#0F172A" text-anchor="middle" direction="ltr">${escapeXml(phone)}</text>
        ${whatsappIcon(516, 33)}
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

    const promoY = 1200;
    const salesHasPromo = Boolean(promotion);
    const availY = 1565;
    const ctaY = 1605;

    return `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" role="img" aria-label="${escapeXml(BRAND.brandName)}">
        ${commonDefs()}
        <g id="scene-background" data-template="${template}">${background.markup}</g>
        ${opts.showLogo === false ? "" : brandHeader(width, opts.brandLogoUrl)}
        ${occasion ? occasionRibbon(width, occasion) : ""}
        ${productNameTitle(width, headline)}
        ${podiumAndPackshot(width, productUrl)}
        ${promotion ? promoBadge(width, promoY, promotion) : ""}
        ${benefit ? highImpactSalesTypography(width, benefit) : ""}
        ${availability ? availabilityPill(width, availY, availability) : ""}
        ${!salesHasPromo && cta ? ctaPill(width, ctaY, cta) : ""}
        ${opts.showFooterBar === false ? "" : contactBlock(width, height)}
      </svg>
    `.trim();
  }
}
