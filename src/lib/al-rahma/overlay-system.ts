import { AL_RAHMA_BRAND_CONFIG } from "./brand-core";
import {
  AdVariant,
  BackgroundLayer,
  BackgroundProviderId,
  resolveBackground,
} from "./background-provider";
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

export class OverlaySystem {
  /**
   * Clean white + subtle silver-mesh WhatsApp Status composer.
   * No pricing, discounts, or generative packaging.
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

    const background =
      opts.background ??
      resolveBackground(opts.backgroundProvider, { width, height, variant });

    const slate = BRAND.visual.primaryColors.slate;
    const darkEmerald = BRAND.visual.primaryColors.darkEmerald;
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
        ? packshot(opts.productImageUrl, {
            x: 150,
            y: 400,
            width: 780,
            height: 900,
          })
        : packshot(
            opts.productImageUrl,
            { x: 180, y: 470, width: 720, height: 850 },
            "rotate(-7 540 895)",
          );

    const copy =
      variant === "hero-clean"
        ? `
          ${textBlock(headlineLines, { x: width / 2, y: 246, size: 56, fill: slate, weight: 900 })}
          ${availability ? availabilityPill((width - 330) / 2, 1344, availability) : ""}
          ${textBlock(benefitLines, { x: width / 2, y: availability ? 1482 : 1436, size: 34, fill: darkEmerald, weight: 700 })}
          ${cta ? ctaPill((width - 640) / 2, 1568, cta) : ""}
        `
        : `
          ${textBlock(headlineLines, { x: width - 72, y: 246, size: 54, fill: slate, weight: 900, anchor: "end" })}
          ${availability ? availabilityPill(width - 402, 1360, availability) : ""}
          ${textBlock(benefitLines, { x: width - 72, y: 1490, size: 32, fill: darkEmerald, weight: 700, anchor: "end" })}
          ${cta ? ctaPill((width - 640) / 2, 1584, cta) : ""}
        `;

    return `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(BRAND.brandName)}">
        ${defs}
        ${backgroundMarkup}
        ${variant === "studio-angle" ? studioAccents() : ""}
        ${logo}
        ${hero}
        ${copy}
        ${opts.showFooterBar === false ? "" : footerBar(width, height, footerText)}
      </svg>
    `.trim();
  }
}
