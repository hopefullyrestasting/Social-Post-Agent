import { AL_RAHMA_BRAND_CONFIG } from "./brand-core";
import {
  AdVariant,
  BackgroundLayer,
  BackgroundProviderId,
  resolveBackground,
} from "./background-provider";
import {
  OccasionGreetingInput,
  ValidPromotion,
} from "./commercial";
import { escapeXml, wrapText } from "./svg-utils";

export type { AdVariant } from "./background-provider";

export interface OverlayOptions {
  width?: number;
  height?: number;
  variant?: AdVariant;
  productImageUrl?: string | null;
  headline?: string;
  benefitLine?: string;
  ctaText?: string;
  availabilityText?: string;
  footerText?: string;
  showLogo?: boolean;
  showFooterBar?: boolean;
  background?: BackgroundLayer;
  backgroundProvider?: BackgroundProviderId;
  /** Already validated as active and in-window. Never raw user input. */
  promotion?: ValidPromotion | null;
  /** Already validated by the API (48h cultural window). */
  occasion?: OccasionGreetingInput | null;
}

const BRAND = AL_RAHMA_BRAND_CONFIG;
const DEFAULT_FOOTER_TEXT = `${BRAND.contact.phone} · للطلب والاستفسار`;

function textBlock(
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
    lineHeight = Math.round(size * 1.38),
  } = options;

  return lines
    .map(
      (line, index) =>
        `<text x="${x}" y="${y + index * lineHeight}" font-family="${escapeXml(
          BRAND.visual.fonts.primary,
        )}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${escapeXml(
          line,
        )}</text>`,
    )
    .join("\n");
}

function brandChip(x: number, y: number): string {
  const emerald = BRAND.visual.primaryColors.emerald;
  return `
    <g transform="translate(${x}, ${y})">
      <rect width="330" height="76" rx="20" fill="#0F172A" fill-opacity="0.93" />
      <rect width="330" height="76" rx="20" fill="none" stroke="${emerald}" stroke-width="2" />
      <circle cx="42" cy="38" r="19" fill="${emerald}" />
      <path d="M33 38 L39 44 L51 32" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
      <text x="76" y="34" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="19" font-weight="800" fill="#FFFFFF">${escapeXml(BRAND.brandName)}</text>
      <text x="76" y="57" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="12" fill="${BRAND.visual.primaryColors.amber}">${escapeXml(BRAND.taglineShort)}</text>
    </g>
  `;
}

function availabilityPill(x: number, y: number, text: string): string {
  const emerald = BRAND.visual.primaryColors.emerald;
  return `
    <g transform="translate(${x}, ${y})">
      <rect width="330" height="54" rx="27" fill="#FFFFFF" fill-opacity="0.94" stroke="${emerald}" stroke-width="2" />
      <circle cx="34" cy="27" r="8" fill="${emerald}" />
      <text x="56" y="34" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="20" font-weight="700" fill="${BRAND.visual.primaryColors.darkEmerald}" text-anchor="start">${escapeXml(text)}</text>
    </g>
  `;
}

function ctaPill(x: number, y: number, text: string): string {
  const emerald = BRAND.visual.primaryColors.emerald;
  return `
    <g transform="translate(${x}, ${y})">
      <rect width="640" height="78" rx="39" fill="${emerald}" />
      <rect width="640" height="78" rx="39" fill="none" stroke="#FFFFFF" stroke-opacity="0.35" stroke-width="1.5" />
      <text x="320" y="50" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="26" font-weight="800" fill="#FFFFFF" text-anchor="middle">${escapeXml(text)}</text>
    </g>
  `;
}

function footerBar(width: number, height: number, footerText: string): string {
  const darkEmerald = BRAND.visual.primaryColors.darkEmerald;
  const amber = BRAND.visual.primaryColors.amber;
  const barHeight = 58;
  const y = height - barHeight;

  return `
    <g id="contact-bar">
      <rect x="0" y="${y}" width="${width}" height="${barHeight}" fill="${darkEmerald}" />
      <rect x="0" y="${y}" width="${width}" height="3" fill="${amber}" />
      <g transform="translate(40, ${y + 10})">
        <rect width="156" height="38" rx="19" fill="#25D366" />
        <text x="78" y="26" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="18" font-weight="800" fill="#073B1E" text-anchor="middle">واتساب</text>
      </g>
      <text x="${width - 32}" y="${y + 37}" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="21" font-weight="700" fill="#FFFFFF" text-anchor="end">${escapeXml(footerText)}</text>
    </g>
  `;
}

function packshot(
  url: string | null | undefined,
  box: { x: number; y: number; width: number; height: number },
  transform?: string,
): string {
  if (!url) {
    return `
      <g ${transform ? `transform="${transform}"` : ""}>
        <rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="28" fill="none" stroke="${BRAND.visual.secondaryColors.lightGray}" stroke-width="3" stroke-dasharray="14 12" />
        <text x="${box.x + box.width / 2}" y="${box.y + box.height / 2}" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="30" font-weight="700" fill="${BRAND.visual.secondaryColors.lightGray}" text-anchor="middle">الصورة المرجعية غير متاحة</text>
      </g>
    `;
  }

  return `
    <g ${transform ? `transform="${transform}"` : ""} filter="url(#packshot-shadow)">
      <image href="${escapeXml(url)}" x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" preserveAspectRatio="xMidYMid meet" />
    </g>
  `;
}

function studioAccents(): string {
  const emerald = BRAND.visual.primaryColors.emerald;
  const silver = BRAND.visual.background.mesh.color;

  return `
    <g id="studio-accents" fill="none">
      <circle cx="128" cy="760" r="238" stroke="${emerald}" stroke-opacity="0.14" stroke-width="3" />
      <circle cx="128" cy="760" r="168" stroke="${silver}" stroke-opacity="0.7" stroke-width="2" />
      <path d="M 880 1500 L 1010 1500 L 1010 1630" stroke="${emerald}" stroke-opacity="0.18" stroke-width="3" />
      <path d="M 60 1420 L 60 1530 L 170 1530" stroke="${silver}" stroke-opacity="0.8" stroke-width="2" />
      <circle cx="938" cy="432" r="46" fill="${emerald}" fill-opacity="0.08" />
    </g>
  `;
}

/**
 * Radial studio rim glow placed behind the packshot. The gradient peaks close
 * to its outer edge so the product reads as if it were lit from a soft box.
 */
function studioLighting(variant: AdVariant): string {
  const emerald = BRAND.visual.primaryColors.emerald;
  const silver = BRAND.visual.background.mesh.color;
  const cy = variant === "hero-clean" ? 852 : 884;

  return `
    <g id="studio-rim-glow" fill="none">
      <ellipse cx="540" cy="${cy}" rx="372" ry="452" fill="url(#studio-rim-gradient)" />
      <circle cx="540" cy="${cy}" r="304" stroke="${emerald}" stroke-opacity="0.12" stroke-width="2.5" />
      <ellipse cx="540" cy="${cy + 20}" rx="238" ry="300" stroke="${silver}" stroke-opacity="0.5" stroke-width="1.5" />
    </g>
  `;
}

/** Grounded elliptical contact shadow beneath the bottle base. */
function contactShadow(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): string {
  return `
    <ellipse id="contact-shadow" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#contact-shadow-fill)" filter="url(#contact-shadow-blur)" />
  `;
}

/**
 * Variant 2 gets a layered, angled secondary packshot behind the hero. It is
 * the same authentic image (never regenerated), just scaled, rotated and
 * softened so the composition has real studio depth.
 */
function depthLayer(url: string | null | undefined): string {
  if (!url) return "";

  const emerald = BRAND.visual.primaryColors.emerald;
  const silver = BRAND.visual.background.mesh.color;

  return `
    <g id="multi-bottle-depth">
      <rect x="116" y="420" width="848" height="936" rx="52" fill="none" stroke="${emerald}" stroke-opacity="0.14" stroke-width="2" />
      <rect x="150" y="454" width="780" height="868" rx="42" fill="none" stroke="${silver}" stroke-opacity="0.6" stroke-width="1.5" />
      <g opacity="0.24" filter="url(#depth-blur)" transform="rotate(11 726 762)">
        <image href="${escapeXml(url)}" x="548" y="496" width="424" height="528" preserveAspectRatio="xMidYMid meet" />
      </g>
      <path d="M 96 1210 L 96 1352 L 238 1352" fill="none" stroke="${emerald}" stroke-opacity="0.22" stroke-width="3" />
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

/** 48h cultural greeting ribbon (`كل عام وأنتم بخير بمناسبة ...`). */
function occasionRibbon(
  width: number,
  occasion: OccasionGreetingInput,
): string {
  const ribbonWidth = Math.min(920, width - 80);
  const x = (width - ribbonWidth) / 2;
  const y = 140;
  const height = 58;
  const accent = resolveAccent(occasion.accentTheme);
  const text = wrapText(occasion.greeting, 52, 1)[0] ?? occasion.greeting;
  const fontSize = occasion.greeting.length > 46 ? 21 : 24;

  return `
    <g id="occasion-ribbon" transform="translate(${x}, ${y})">
      <rect width="${ribbonWidth}" height="${height}" rx="${height / 2}" fill="${BRAND.commercial.occasionRibbon.backgroundColor}" fill-opacity="0.95" stroke="${accent}" stroke-width="2" />
      <circle cx="34" cy="${height / 2}" r="9" fill="${accent}" />
      <path d="M ${ribbonWidth - 46} ${height / 2 - 10} L ${ribbonWidth - 32} ${height / 2} L ${ribbonWidth - 46} ${height / 2 + 10} Z" fill="${accent}" fill-opacity="0.75" />
      <text x="${ribbonWidth / 2}" y="38" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="${fontSize}" font-weight="800" fill="${BRAND.commercial.occasionRibbon.textColor}" text-anchor="middle">${escapeXml(text)}</text>
    </g>
  `;
}

function formatPriceValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/**
 * Elegant, fully server-validated promotion card: original price, discount
 * percentage and final price. Only rendered when a real active promotion row
 * exists; expired or hallucinated records never reach this function.
 */
function promoBadge(
  width: number,
  y: number,
  promotion: ValidPromotion,
): string {
  const badgeWidth = Math.min(660, width - 96);
  const x = (width - badgeWidth) / 2;
  const height = 168;
  const config = BRAND.commercial;
  const currency = config.currencyLabel;
  const slate = BRAND.visual.primaryColors.slate;

  return `
    <g id="promo-badge" transform="translate(${x}, ${y})">
      <rect width="${badgeWidth}" height="${height}" rx="28" fill="${config.promoBadge.backgroundColor}" stroke="${config.promoBadge.accentColor}" stroke-width="2.5" />
      <rect x="24" y="0" width="${badgeWidth - 48}" height="5" rx="2.5" fill="${config.promoBadge.accentColor}" />
      <g transform="translate(30, 30)">
        <rect width="184" height="54" rx="27" fill="${config.promoBadge.discountColor}" />
        <text x="92" y="35" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="23" font-weight="900" fill="#FFFFFF" text-anchor="middle">خصم ${promotion.discountPercent}%</text>
      </g>
      <text x="${badgeWidth - 34}" y="44" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="17" font-weight="700" fill="${slate}" fill-opacity="0.65" text-anchor="end">السعر بعد الخصم</text>
      <text x="${badgeWidth - 34}" y="104" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="54" font-weight="900" fill="${config.promoBadge.textColor}" text-anchor="end">${escapeXml(formatPriceValue(promotion.promoPrice))} ${escapeXml(currency)}</text>
      <text x="30" y="116" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="22" font-weight="700" fill="${slate}" fill-opacity="0.8" text-anchor="start" text-decoration="line-through">${escapeXml(formatPriceValue(promotion.originalPrice))} ${escapeXml(currency)}</text>
      <text x="30" y="145" font-family="${escapeXml(BRAND.visual.fonts.primary)}" font-size="15" font-weight="600" fill="${slate}" fill-opacity="0.55" text-anchor="start">السعر قبل الخصم</text>
    </g>
  `;
}

export class OverlaySystem {
  /**
   * Clean white + subtle silver-mesh WhatsApp Status composer.
   *
   * Pricing is drawn only from an active, validated promotion row; the
   * cultural greeting ribbon is drawn only when the caller supplies an
   * in-window occasion. Packaging is always the authentic packshot.
   */
  public static generateOverlaySvg(opts: OverlayOptions = {}): string {
    const width = opts.width ?? BRAND.visual.format.width;
    const height = opts.height ?? BRAND.visual.format.height;
    const variant = opts.variant ?? "hero-clean";
    const headline = (opts.headline ?? "").trim();
    const benefit = (opts.benefitLine ?? "").trim();
    const cta = (opts.ctaText ?? "").trim();
    const availability = (opts.availabilityText ?? "").trim();
    const footerText = opts.footerText ?? DEFAULT_FOOTER_TEXT;
    const promotion = opts.promotion ?? null;
    const occasion = opts.occasion ?? null;
    const productUrl = opts.productImageUrl?.trim() || null;

    const background =
      opts.background ??
      resolveBackground(opts.backgroundProvider, { width, height, variant });

    const slate = BRAND.visual.primaryColors.slate;
    const darkEmerald = BRAND.visual.primaryColors.darkEmerald;
    const emerald = BRAND.visual.primaryColors.emerald;
    const silver = BRAND.visual.background.mesh.color;
    const white = BRAND.visual.secondaryColors.white;

    const headlineLines = wrapText(headline, variant === "hero-clean" ? 24 : 22, 2);
    const benefitLines = wrapText(benefit, variant === "hero-clean" ? 34 : 32, 2);

    const backgroundMarkup =
      background.kind === "mesh"
        ? background.markup
        : `<rect width="${width}" height="${height}" fill="${white}" />${background.markup}`;

    const defs = `
      <defs>
        <filter id="packshot-shadow" x="-35%" y="-35%" width="170%" height="180%">
          <feDropShadow dx="0" dy="26" stdDeviation="22" flood-color="#0F172A" flood-opacity="0.20" />
        </filter>
        <filter id="contact-shadow-blur" x="-40%" y="-160%" width="180%" height="420%">
          <feGaussianBlur stdDeviation="16" />
        </filter>
        <filter id="depth-blur" x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
        <radialGradient id="contact-shadow-fill" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#0F172A" stop-opacity="0.34" />
          <stop offset="68%" stop-color="#0F172A" stop-opacity="0.13" />
          <stop offset="100%" stop-color="#0F172A" stop-opacity="0" />
        </radialGradient>
        <radialGradient id="studio-rim-gradient" cx="50%" cy="48%" r="56%">
          <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0" />
          <stop offset="58%" stop-color="${emerald}" stop-opacity="0.04" />
          <stop offset="82%" stop-color="${emerald}" stop-opacity="0.13" />
          <stop offset="94%" stop-color="${silver}" stop-opacity="0.10" />
          <stop offset="100%" stop-color="${silver}" stop-opacity="0" />
        </radialGradient>
      </defs>
    `;

    const logo =
      opts.showLogo === false
        ? ""
        : variant === "hero-clean"
          ? brandChip((width - 330) / 2, 54)
          : brandChip(width - 330 - 54, 54);

    const hero =
      variant === "hero-clean"
        ? `
          ${contactShadow(540, 1312, 292, 42)}
          ${packshot(productUrl, {
            x: 150,
            y: 400,
            width: 780,
            height: 900,
          })}
        `
        : `
          ${depthLayer(productUrl)}
          ${contactShadow(540, 1338, 312, 46)}
          ${packshot(
            productUrl,
            { x: 180, y: 470, width: 720, height: 850 },
            "rotate(-7 540 895)",
          )}
        `;

    const promoHero = Boolean(promotion);
    const promoY = variant === "hero-clean" ? 1360 : 1362;
    const availabilityY = promoHero
      ? variant === "hero-clean"
        ? 1548
        : 1550
      : variant === "hero-clean"
        ? 1344
        : 1360;
    const benefitY = promoHero
      ? variant === "hero-clean"
        ? 1620
        : 1622
      : variant === "hero-clean"
        ? availability
          ? 1482
          : 1436
        : 1490;
    const ctaY = promoHero
      ? variant === "hero-clean"
        ? 1692
        : 1694
      : variant === "hero-clean"
        ? 1568
        : 1584;

    const copy =
      variant === "hero-clean"
        ? `
          ${textBlock(headlineLines, { x: width / 2, y: 246, size: 56, fill: slate, weight: 900 })}
          ${availability ? availabilityPill((width - 330) / 2, availabilityY, availability) : ""}
          ${textBlock(benefitLines, { x: width / 2, y: benefitY, size: 34, fill: darkEmerald, weight: 700 })}
          ${promotion ? promoBadge(width, promoY, promotion) : ""}
          ${cta ? ctaPill((width - 640) / 2, ctaY, cta) : ""}
        `
        : `
          ${textBlock(headlineLines, { x: width - 72, y: 246, size: 54, fill: slate, weight: 900, anchor: "end" })}
          ${availability ? availabilityPill(width - 402, availabilityY, availability) : ""}
          ${textBlock(benefitLines, { x: width - 72, y: benefitY, size: 32, fill: darkEmerald, weight: 700, anchor: "end" })}
          ${promotion ? promoBadge(width, promoY, promotion) : ""}
          ${cta ? ctaPill((width - 640) / 2, ctaY, cta) : ""}
        `;

    return `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(BRAND.brandName)}">
        ${defs}
        ${backgroundMarkup}
        ${variant === "studio-angle" ? studioAccents() : ""}
        ${studioLighting(variant)}
        ${logo}
        ${hero}
        ${occasion ? occasionRibbon(width, occasion) : ""}
        ${copy}
        ${opts.showFooterBar === false ? "" : footerBar(width, height, footerText)}
      </svg>
    `.trim();
  }
}
