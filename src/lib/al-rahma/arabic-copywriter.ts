import { AL_RAHMA_BRAND_CONFIG } from "./brand-core";

export type PostAngle =
  | "flash_sale"
  | "product_features"
  | "beauty_routine"
  | "combo_deal"
  | "product_information";

export interface ProductDetails {
  title: string;
  category: string;
  originalPrice?: number;
  salePrice?: number;
  currency?: string;
  features: string[];
  urgencyNote?: string;
  badgeText?: string;
  sourceUrl?: string;
  verificationStatus?: string;
}

export interface GeneratedArabicCopy {
  headline: string;
  hook: string;
  body: string;
  cta: string;
  priceTag: string;
  savingsText?: string;
  hashtags: string[];
  fullPostText: string;
}

/**
 * Templates may reference `{{brand}}` and `{{phone}}` only. The values are
 * injected from `AL_RAHMA_BRAND_CONFIG` so no brand identity is hardcoded here.
 */
const HOOKS_BY_ANGLE: Record<PostAngle, string[]> = {
  flash_sale: [
    "للاستفسار عن السعر والعروض المتاحة، تواصلوا مع {{brand}}.",
    "اكتشفوا تفاصيل المنتج واسألوا عن السعر الحالي.",
  ],
  product_features: [
    "تفاصيل المنتج التالية مأخوذة من المعلومات التي أُدخلت له.",
    "راجعوا بيانات المنتج ومصدر معلوماته قبل الاستخدام.",
  ],
  beauty_routine: [
    "اختيار منتجات العناية يبدأ من معرفة تفاصيل المنتج.",
    "تعرّفوا على معلومات المنتج قبل إضافته إلى روتين العناية.",
  ],
  combo_deal: [
    "للاستفسار عن العروض المتاحة على منتجات {{brand}}، تواصلوا معنا.",
    "اسألوا {{brand}} عن تفاصيل المنتجات والعروض الحالية.",
  ],
  product_information: [
    "تعرفوا على معلومات المنتج ومصدرها قبل اتخاذ قرار الشراء.",
    "معلومات المنتج المتاحة تساعدكم على اختيار ما يناسبكم.",
  ],
};

const CTA_TEMPLATES = [
  "للطلب والاستفسار تواصلوا معنا على {{phone}} أو عبر واتساب.",
  "للاستفسار عن السعر والتوفر: {{phone}} | واتساب {{brand}}.",
];

function renderTemplate(template: string): string {
  const values: Record<string, string> = {
    brand: AL_RAHMA_BRAND_CONFIG.brandName,
    phone: AL_RAHMA_BRAND_CONFIG.contact.phone,
  };

  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in values ? values[key] : match,
  );
}

export class ArabicCopywriter {
  public static generatePost(
    product: ProductDetails,
    angle: PostAngle = "product_information",
  ): GeneratedArabicCopy {
    const currency = product.currency || "ج.م";
    const hooks = HOOKS_BY_ANGLE[angle];
    const hook = renderTemplate(hooks[Math.floor(Math.random() * hooks.length)]);
    const salePrice = product.salePrice;
    const hasSalePrice =
      salePrice !== undefined && Number.isFinite(salePrice) && salePrice > 0;
    const originalPrice = product.originalPrice;
    const hasDiscount =
      hasSalePrice &&
      originalPrice !== undefined &&
      Number.isFinite(originalPrice) &&
      originalPrice > salePrice;
    const savingsText = hasDiscount
      ? `فرق السعر: ${originalPrice - salePrice} ${currency}`
      : undefined;
    const priceTag = hasSalePrice
      ? hasDiscount
        ? `السعر السابق: ${originalPrice} ${currency}\nالسعر: ${salePrice} ${currency}`
        : `السعر: ${salePrice} ${currency}`
      : "";
    const headline = product.badgeText || product.title;
    const cta = renderTemplate(
      CTA_TEMPLATES[Math.floor(Math.random() * CTA_TEMPLATES.length)],
    );
    const facts = product.features
      .map((feature) => feature.trim())
      .filter(Boolean)
      .map((feature) => `• ${feature}`);
    const details = [
      product.category.trim() ? `التصنيف: ${product.category.trim()}` : "",
      ...facts,
      priceTag,
      product.urgencyNote?.trim() || "",
      product.sourceUrl?.trim()
        ? `مصدر المعلومات: ${product.sourceUrl.trim()}`
        : "",
    ].filter(Boolean);
    const body = [hook, ...details, cta].join("\n\n");
    const specificHashtags = [
      product.category.trim()
        ? `#${product.category.trim().replace(/\s+/g, "_")}`
        : "",
      product.title.trim()
        ? `#${product.title.trim().split(/\s+/)[0]}`
        : "",
    ].filter(Boolean);
    const hashtags = Array.from(
      new Set([...specificHashtags, ...AL_RAHMA_BRAND_CONFIG.hashtags]),
    );
    const fullPostText = `${headline}\n\n${body}\n\n${hashtags.join(" ")}`;

    return {
      headline,
      hook,
      body,
      cta,
      priceTag,
      savingsText,
      hashtags,
      fullPostText,
    };
  }
}
