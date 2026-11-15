import { AL_RAHMA_BRAND_CORE } from "./brand-core";

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

const HOOKS_BY_ANGLE: Record<PostAngle, string[]> = {
  flash_sale: [
    "للاستفسار عن السعر والعروض المتاحة، تواصلوا مع مخزن الرحمة.",
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
    "للاستفسار عن العروض المتاحة على منتجات مخزن الرحمة، تواصلوا معنا.",
    "اسألوا مخزن الرحمة عن تفاصيل المنتجات والعروض الحالية.",
  ],
  product_information: [
    "تعرفوا على معلومات المنتج ومصدرها قبل اتخاذ قرار الشراء.",
    "معلومات المنتج المتاحة تساعدكم على اختيار ما يناسبكم.",
  ],
};

const CTA_OPTIONS = [
  "للطلب والاستفسار تواصلوا معنا على 01000017548 أو عبر واتساب.",
  "للاستفسار عن السعر والتوفر: 01000017548 | واتساب مخزن الرحمة.",
];

export class ArabicCopywriter {
  public static generatePost(
    product: ProductDetails,
    angle: PostAngle = "product_information",
  ): GeneratedArabicCopy {
    const currency = product.currency || "ج.م";
    const hooks = HOOKS_BY_ANGLE[angle];
    const hook = hooks[Math.floor(Math.random() * hooks.length)];
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
    const cta = CTA_OPTIONS[Math.floor(Math.random() * CTA_OPTIONS.length)];
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
      new Set([...specificHashtags, ...AL_RAHMA_BRAND_CORE.defaultHashtags]),
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
