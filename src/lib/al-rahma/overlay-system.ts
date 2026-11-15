import { AL_RAHMA_BRAND_CONFIG } from "./brand-core";
import {
  BackgroundLayer,
  DesignerTemplate,
  resolveBackground,
} from "./background-provider";
import { OccasionGreetingInput, ValidPromotion } from "./commercial";
import { escapeXml, wrapText } from "./svg-utils";

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
  /** Prominent sales copy (4-9 words). */
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
const CONTACT_LABEL = "للتواصل :";

function phoneIcon(x: number, y: number): string {
  return `
    <g transform="translate(${x}, ${y})" stroke="#0F172A" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round">
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

function brandHeader(width: number, brandLogoUrl?: string | null): string {
  const y = 44;
  const cardW = 900;
  const cardH = 132;
  const x = (width - cardW) / 2;
  const subtitle = SUBTITLE;
  const logo = brandLogoUrl?.trim() || null;

  const badge = logo
    ? `<image href="${escapeXml(logo)}" x="18" y="16" width="100" height="100" preserveAspectRatio="xMidYMid meet" />
       <rect x="18" y="16" width="100" height="100" rx="20" fill="none" stroke="#059669" stroke-width="2" />`
    : `<circle cx="68" cy="66" r="34" fill="#059669" />
       <path d="M50 66 L63 78 L86 52" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />`;

  return `
    <g id="brand-header" transform="translate(${x}, ${y})">
      <rect width="${cardW}" height="${cardH}" rx="28" fill="#0F172A" fill-opacity="0.94" />
      <rect width="${cardW}" height="${cardH}" rx="28" fill="none" stroke="#059669" stroke-width="2.5" />
      ${badge}
      <text x="136" y="58" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="40" font-weight="800" fill="#FFFFFF" text-anchor="start">${escapeXml(BRAND.brandName)}</text>
      <text x="${cardW / 2}" y="106" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="30" font-weight="700" fill="#F8FAFC" text-anchor="middle">${escapeXml(subtitle)}</text>
    </g>
  `;
}

function contactBlock(width: number, height: number): string {
  const barH = 156;
  const y = height - barH;
  const phone = BRAND.contact.phone;
  const label = CONTACT_LABEL;
  return `
    <g id="contact-block">
      <rect x="0" y="${y}" width="${width}" height="${barH}" fill="#065F46" />
      <rect x="0" y="${y}" width="${width}" height="5" fill="#F59E0B" />
      <text x="${width / 2}" y="${y + 50}" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="36" font-weight="800" fill="#FFFFFF" text-anchor="middle">${escapeXml(label)}</text>
      <g transform="translate(${width / 2 - 260}, ${y + 72})">
        <rect x="0" y="0" width="520" height="68" rx="34" fill="#FFFFFF" fill-opacity="0.98" />
        ${phoneIcon(40, 22)}
        <text x="260" y="46" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="42" font-weight="900" fill="#0F172A" text-anchor="middle" direction="ltr">${escapeXml(phone)}</text>
        ${whatsappIcon(456, 22)}
      </g>
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
    lineHeight = Math.round(size * 1.35),
  } = options;
  if (lines.length === 0) return "";
  const tspans = lines
    .map(
      (line, index) =>
        `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`,
    )
    .join("");
  return `<text x="${x}" y="${y}" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${tspans}</text>`;
}

function availabilityPill(x: number, y: number, text: string): string {
  return `
    <g transform="translate(${x}, ${y})">
      <rect width="360" height="56" rx="28" fill="#FFFFFF" fill-opacity="0.96" stroke="#059669" stroke-width="2" />
      <circle cx="34" cy="28" r="8" fill="#059669" />
      <text x="58" y="36" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="23" font-weight="700" fill="#065F46" text-anchor="start">${escapeXml(text)}</text>
    </g>
  `;
}

function ctaPill(x: number, y: number, text: string): string {
  return `
    <g transform="translate(${x}, ${y})">
      <rect width="520" height="74" rx="37" fill="#059669" />
      <text x="260" y="48" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="30" font-weight="800" fill="#FFFFFF" text-anchor="middle">${escapeXml(text)}</text>
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
  const y = 188;
  const height = 56;
  const accent = resolveAccent(occasion.accentTheme);
  const text = wrapText(occasion.greeting, 52, 1)[0] ?? occasion.greeting;
  return `
    <g id="occasion-ribbon" transform="translate(${x}, ${y})">
      <rect width="${ribbonWidth}" height="${height}" rx="${height / 2}" fill="#FFFFFF" fill-opacity="0.96" stroke="${accent}" stroke-width="2" />
      <circle cx="32" cy="${height / 2}" r="8" fill="${accent}" />
      <text x="${ribbonWidth / 2}" y="37" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="23" font-weight="800" fill="#065F46" text-anchor="middle">${escapeXml(text)}</text>
    </g>
  `;
}

function formatPriceValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function promoBadge(width: number, y: number, promotion: ValidPromotion): string {
  const badgeWidth = Math.min(660, width - 96);
  const x = (width - badgeWidth) / 2;
  const height = 160;
  const currency = BRAND.commercial.currencyLabel;
  return `
    <g id="promo-badge" transform="translate(${x}, ${y})">
      <rect width="${badgeWidth}" height="${height}" rx="28" fill="#FFFFFF" stroke="#F59E0B" stroke-width="2.5" />
      <g transform="translate(28, 28)">
        <rect width="176" height="52" rx="26" fill="#DC2626" />
        <text x="88" y="34" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="22" font-weight="900" fill="#FFFFFF" text-anchor="middle">خصم ${promotion.discountPercent}%</text>
      </g>
      <text x="${badgeWidth - 30}" y="98" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="52" font-weight="900" fill="#065F46" text-anchor="end">${escapeXml(formatPriceValue(promotion.promoPrice))} ${escapeXml(currency)}</text>
      <text x="28" y="112" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="22" font-weight="700" fill="#334155" fill-opacity="0.75" text-anchor="start" text-decoration="line-through">${escapeXml(formatPriceValue(promotion.originalPrice))} ${escapeXml(currency)}</text>
    </g>
  `;
}

function packshotImage(
  url: string | null | undefined,
  box: { x: number; y: number; width: number; height: number },
  rotateDeg = 0,
): string {
  if (!url) {
    return `
      <g id="packshot-missing">
        <rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="28" fill="none" stroke="#94A3B8" stroke-width="3" stroke-dasharray="14 12" />
        <text x="${box.x + box.width / 2}" y="${box.y + box.height / 2}" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="28" font-weight="700" fill="#64748B" text-anchor="middle">الصورة الأصلية غير متاحة</text>
      </g>
    `;
  }
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const transform = rotateDeg ? ` transform="rotate(${rotateDeg} ${cx} ${cy})"` : "";
  return `
    <g id="packshot" data-packshot="true"${transform} filter="url(#packshot-shadow)">
      <image data-packshot="true" href="${escapeXml(url)}" x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" preserveAspectRatio="xMidYMid meet" />
    </g>
  `;
}

function shadowEllipse(cx: number, cy: number, rx: number, ry: number): string {
  return `<ellipse id="contact-shadow" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#0F172A" fill-opacity="0.22" filter="url(#shadow-blur)" />`;
}

function commonDefs(): string {
  return `
    <defs>
      <filter id="packshot-shadow" x="-30%" y="-30%" width="160%" height="170%">
        <feDropShadow dx="0" dy="26" stdDeviation="18" flood-color="#0F172A" flood-opacity="0.28" />
      </filter>
      <filter id="shadow-blur" x="-40%" y="-160%" width="180%" height="420%">
        <feGaussianBlur stdDeviation="16" />
      </filter>
    </defs>
  `;
}

function layoutForTemplate(
  template: DesignerTemplate,
  opts: {
    width: number;
    height: number;
    productUrl: string | null;
    headlineLines: string[];
    benefitLines: string[];
    availability: string;
    cta: string;
    promotion: ValidPromotion | null;
  },
): string {
  const { width, productUrl, headlineLines, benefitLines, availability, cta, promotion } = opts;
  const headlineColor = "#0F172A"; // bold charcoal/dark
  const benefitColor = "#065F46"; // dark emerald
  const centerX = width / 2;

  // Keep all text within max-width 880px centered at x=540
  if (template === "silver-podium-botanical") {
    const promoY = 1340;
    const headlineY = 300;
    const benefitY = promotion ? 1530 : 1410;
    const availY = promotion ? 1620 : 1505;
    const ctaY = 1685;
    return `
      ${shadowEllipse(centerX, 1330, 320, 48)}
      ${packshotImage(productUrl, { x: 170, y: 430, width: 740, height: 880 })}
      ${textBlockTspans(headlineLines, { x: centerX, y: headlineY, size: 54, fill: headlineColor, weight: 800, anchor: "middle", lineHeight: 72 })}
      ${textBlockTspans(benefitLines, { x: centerX, y: benefitY, size: 40, fill: benefitColor, weight: 700, anchor: "middle", lineHeight: 56 })}
      ${promotion ? promoBadge(width, promoY, promotion) : ""}
      ${availability ? availabilityPill((width - 360) / 2, availY, availability) : ""}
      ${cta ? ctaPill((width - 520) / 2, ctaY, cta) : ""}
    `;
  }

  if (template === "botanical-arch-frame") {
    const promoY = 1385;
    const headlineY = 300;
    const benefitY = promotion ? 1570 : 1465;
    const availY = promotion ? 1650 : 1555;
    const ctaY = 1690;
    return `
      ${shadowEllipse(centerX, 1310, 270, 42)}
      ${packshotImage(productUrl, { x: 220, y: 440, width: 640, height: 840 })}
      ${textBlockTspans(headlineLines, { x: centerX, y: headlineY, size: 54, fill: headlineColor, weight: 800, anchor: "middle", lineHeight: 72 })}
      ${promotion ? promoBadge(width, promoY, promotion) : ""}
      ${textBlockTspans(benefitLines, { x: centerX, y: benefitY, size: 40, fill: benefitColor, weight: 700, anchor: "middle", lineHeight: 56 })}
      ${availability ? availabilityPill((width - 360) / 2, availY, availability) : ""}
      ${cta ? ctaPill((width - 520) / 2, ctaY, cta) : ""}
    `;
  }

  // editorial-beauty-card
  const promoY = 1365;
  const headlineY = 300;
  const benefitY = promotion ? 1545 : 1420;
  const availY = promotion ? 1630 : 1510;
  const ctaY = 1690;
  return `
    ${shadowEllipse(centerX, 1315, 280, 42)}
    ${packshotImage(productUrl, { x: 230, y: 440, width: 620, height: 840 })}
    ${textBlockTspans(headlineLines, { x: centerX, y: headlineY, size: 54, fill: headlineColor, weight: 800, anchor: "middle", lineHeight: 72 })}
    ${textBlockTspans(benefitLines, { x: centerX, y: benefitY, size: 40, fill: benefitColor, weight: 700, anchor: "middle", lineHeight: 56 })}
    ${promotion ? promoBadge(width, promoY, promotion) : ""}
    ${availability ? availabilityPill((width - 360) / 2, availY, availability) : ""}
    ${cta ? ctaPill((width - 520) / 2, ctaY, cta) : ""}
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

    // max-width ~880px centered at x=540 => ~22-24 chars/line for 54px Arabic, keep safe
    const headlineLines = wrapText(headline, 22, 3);
    const benefitLines = wrapText(benefit, 24, 2);

    return `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" role="img" aria-label="${escapeXml(BRAND.brandName)}">
        ${commonDefs()}
        <g id="scene-background" data-template="${template}">${background.markup}</g>
        ${opts.showLogo === false ? "" : brandHeader(width, opts.brandLogoUrl)}
        ${occasion ? occasionRibbon(width, occasion) : ""}
        ${layoutForTemplate(template, {
          width,
          height,
          productUrl,
          headlineLines,
          benefitLines,
          availability,
          cta,
          promotion,
        })}
        ${opts.showFooterBar === false ? "" : contactBlock(width, height)}
      </svg>
    `.trim();
  }
}
