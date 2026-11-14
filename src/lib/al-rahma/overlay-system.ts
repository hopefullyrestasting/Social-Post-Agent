import { AL_RAHMA_BRAND_CORE } from "./brand-core";

export interface OverlayOptions {
  width: number;
  height: number;
  showLogo?: boolean;
  showDiscountBadge?: boolean;
  discountText?: string;
  showPriceTag?: boolean;
  salePrice?: number;
  originalPrice?: number;
  currency?: string;
  showFooterBar?: boolean;
  footerText?: string;
  customPillText?: string;
}

export class OverlaySystem {
  /**
   * إنشاء كود SVG متكامل للطبقات البصرية العلوية والتنسيق البصري
   */
  public static generateOverlaySvg(opts: OverlayOptions): string {
    const {
      width,
      height,
      showLogo = true,
      showDiscountBadge = true,
      discountText = "عرض خاص",
      showPriceTag = true,
      salePrice,
      originalPrice,
      currency = "ج.م",
      showFooterBar = true,
      footerText = "🚚 شحن لكل مصر | 📦 معاينة قبل الاستلام | 💬 اطلب الآن",
      customPillText,
    } = opts;

    const brand = AL_RAHMA_BRAND_CORE;
    const emerald = brand.primaryColors.emerald;
    const darkEmerald = brand.primaryColors.darkEmerald;
    const amber = brand.primaryColors.amber;
    const red = brand.secondaryColors.alertRed;

    // عناصر الـ SVG
    const svgParts: string[] = [];

    // 1. رأس الصفحة: لوجو وعلامة مخزن الرحمة (Top-Right أو Top-Left)
    if (showLogo) {
      svgParts.push(`
        <!-- Logo Badge -->
        <g id="logo-badge" transform="translate(${width - 240}, 30)">
          <!-- Glassmorphic / Solid Shadow Card -->
          <rect width="210" height="54" rx="14" fill="#0F172A" fill-opacity="0.9" />
          <rect width="210" height="54" rx="14" fill="none" stroke="${emerald}" stroke-width="2" />
          
          <!-- Icon Symbol -->
          <circle cx="32" cy="27" r="14" fill="${emerald}" />
          <path d="M26 27 L30 31 L38 23" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          
          <!-- Brand Typography -->
          <text x="56" y="27" font-family="${brand.fonts.primary}" font-size="16" font-weight="bold" fill="#FFFFFF">
            ${brand.brandName}
          </text>
          <text x="56" y="43" font-family="${brand.fonts.primary}" font-size="10" fill="${amber}">
            أوفر سعر وجودة لكل بيت
          </text>
        </g>
      `);
    }

    // 2. شارة الخصم أو العرض الخاص (Top-Left)
    if (showDiscountBadge && discountText) {
      svgParts.push(`
        <!-- Discount / Deal Badge -->
        <g id="discount-badge" transform="translate(30, 30)">
          <defs>
            <linearGradient id="dealGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="${red}" />
              <stop offset="100%" stop-color="#991B1B" />
            </linearGradient>
            <filter id="badgeShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.35"/>
            </filter>
          </defs>
          <rect width="160" height="48" rx="24" fill="url(#dealGrad)" filter="url(#badgeShadow)" />
          <rect width="160" height="48" rx="24" fill="none" stroke="#FFFFFF" stroke-width="1.5" stroke-opacity="0.6" />
          
          <text x="80" y="30" font-family="${brand.fonts.primary}" font-size="18" font-weight="bold" fill="#FFFFFF" text-anchor="middle">
            🔥 ${discountText}
          </text>
        </g>
      `);
    }

    // 3. شارة مخصصة إضافية (Custom Pill)
    if (customPillText) {
      svgParts.push(`
        <!-- Custom Pill Badge -->
        <g id="custom-pill" transform="translate(30, 90)">
          <rect width="140" height="34" rx="8" fill="${emerald}" fill-opacity="0.95" />
          <text x="70" y="22" font-family="${brand.fonts.primary}" font-size="13" font-weight="bold" fill="#FFFFFF" text-anchor="middle">
            ⭐ ${customPillText}
          </text>
        </g>
      `);
    }

    // 4. بطاقة السعر (Price Tag Card)
    if (showPriceTag && salePrice) {
      const cardY = height - (showFooterBar ? 150 : 100);
      const originalPriceText = originalPrice && originalPrice > salePrice ? `${originalPrice} ${currency}` : "";

      svgParts.push(`
        <!-- Price Tag -->
        <g id="price-card" transform="translate(30, ${cardY})">
          <rect width="230" height="72" rx="16" fill="#0F172A" fill-opacity="0.92" />
          <rect width="230" height="72" rx="16" fill="none" stroke="${amber}" stroke-width="2" />
          
          ${originalPriceText ? `
            <text x="210" y="28" font-family="${brand.fonts.primary}" font-size="13" fill="#94A3B8" text-anchor="end" text-decoration="line-through">
              بدلاً من: ${originalPriceText}
            </text>
          ` : ""}
          
          <text x="210" y="${originalPriceText ? 56 : 46}" font-family="${brand.fonts.primary}" font-size="22" font-weight="900" fill="${amber}" text-anchor="end">
            فقط ${salePrice} ${currency}
          </text>
        </g>
      `);
    }

    // 5. شريط الثقة والتواصل السفلي (Footer Trust Bar)
    if (showFooterBar) {
      const footerY = height - 58;
      svgParts.push(`
        <!-- Footer Trust Bar -->
        <g id="footer-trust-bar" transform="translate(0, ${footerY})">
          <rect width="${width}" height="58" fill="${darkEmerald}" />
          <rect width="${width}" height="3" y="0" fill="${amber}" />
          
          <text x="${width / 2}" y="36" font-family="${brand.fonts.primary}" font-size="16" font-weight="bold" fill="#FFFFFF" text-anchor="middle">
            ${footerText}
          </text>
        </g>
      `);
    }

    return `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        ${svgParts.join("\n")}
      </svg>
    `.trim();
  }
}

