import { AL_RAHMA_BRAND_CONFIG } from "./brand-core";

/**
 * Arabic copy for the white/silver-mesh WhatsApp Status composer.
 *
 * Rules enforced here:
 * - No prices, discounts, urgency or shipping promises.
 * - Benefits/usage lines are only rendered from claims the caller already
 *   verified against a source (see `product-research-verifier`).
 * - Output is deterministic so the same product + variant always produces the
 *   same creative (no `Math.random`).
 */

export type PostAngle =
  | "product_features"
  | "beauty_routine"
  | "combo_deal"
  | "product_information";

export type WarehouseStockStatus = "in_stock" | "out_of_stock" | "unknown";

export type CopyVariant = "hero-clean" | "studio-angle";

export interface ProductDetails {
  title: string;
  category: string;
  features?: string[];
  badgeText?: string;
  sourceUrl?: string;
  verificationStatus?: string;
  /** Claim text already verified against a verified source. */
  verifiedBenefits?: string[];
  /** Usage text already verified against a verified source. */
  verifiedUsage?: string[];
  /** Authentic packshot URL. Required by the composer. */
  productImageUrl?: string | null;
  warehouseStockStatus?: WarehouseStockStatus;
}

export interface CopyOptions {
  variant?: CopyVariant;
  hookIndex?: number;
  ctaIndex?: number;
}

export interface GeneratedArabicCopy {
  headline: string;
  hook: string;
  benefitLine: string;
  body: string;
  cta: string;
  ctaShort: string;
  hashtags: string[];
  fullPostText: string;
}

/**
 * Templates may reference `{{brand}}` and `{{phone}}` only. The values are
 * injected from `AL_RAHMA_BRAND_CONFIG` so no brand identity is hardcoded here.
 */
const HOOKS_BY_ANGLE: Record<PostAngle, [string, string]> = {
  product_information: [
    "تعرفوا على معلومات المنتج ومصدرها قبل اتخاذ قرار الشراء.",
    "معلومات المنتج المتاحة تساعدكم على اختيار ما يناسبكم.",
  ],
  product_features: [
    "تفاصيل المنتج التالية مأخوذة من المعلومات الموثّقة له.",
    "راجعوا بيانات المنتج ومصدر معلوماته قبل الاستخدام.",
  ],
  beauty_routine: [
    "اختيار منتجات العناية يبدأ من معرفة تفاصيل المنتج.",
    "تعرّفوا على معلومات المنتج قبل إضافته إلى روتين العناية.",
  ],
  combo_deal: [
    "لمعرفة تفاصيل منتجات {{brand}} المتوفرة، تواصلوا معنا.",
    "اسألوا {{brand}} عن تفاصيل المنتجات المتاحة لدينا.",
  ],
};

const CTA_TEMPLATES: [string, string] = [
  "للطلب والاستفسار تواصلوا معنا على {{phone}} أو عبر واتساب.",
  "للاستفسار عن تفاصيل المنتج والتوفر: {{phone}} | واتساب {{brand}}.",
];

const CTA_SHORT_TEMPLATES: [string, string] = [
  "اطلب عبر واتساب",
  "تواصل معنا الآن",
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

function clean(items: string[] | undefined): string[] {
  return Array.from(
    new Set(
      (items ?? [])
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    ),
  );
}

function buildHeadline(product: ProductDetails): string {
  const raw = (product.badgeText || product.title || "").trim();
  const words = raw.split(/\s+/).filter(Boolean);

  if (words.length >= 2) return raw;

  const category = (product.category || "").trim().replaceAll("_", " ");
  return `${raw} ${category}`.trim();
}

export class ArabicCopywriter {
  public static generatePost(
    product: ProductDetails,
    angle: PostAngle = "product_information",
    options: CopyOptions = {},
  ): GeneratedArabicCopy {
    const variant: CopyVariant = options.variant ?? "hero-clean";
    const variantIndex = variant === "hero-clean" ? 0 : 1;
    const hooks = HOOKS_BY_ANGLE[angle] ?? HOOKS_BY_ANGLE.product_information;
    const hook = renderTemplate(
      hooks[(options.hookIndex ?? variantIndex) % hooks.length],
    );
    const cta = renderTemplate(
      CTA_TEMPLATES[(options.ctaIndex ?? variantIndex) % CTA_TEMPLATES.length],
    );
    const ctaShort = renderTemplate(
      CTA_SHORT_TEMPLATES[
        (options.ctaIndex ?? variantIndex) % CTA_SHORT_TEMPLATES.length
      ],
    );

    const benefits = clean(product.verifiedBenefits);
    const usage = clean(product.verifiedUsage);
    const benefitLine =
      variant === "hero-clean"
        ? benefits[0] ?? ""
        : benefits[1] ?? usage[0] ?? benefits[0] ?? "";

    const headline = buildHeadline(product);
    const category = (product.category || "").trim().replaceAll("_", " ");
    const facts = clean(product.features).map((feature) => `• ${feature}`);
    const usageFacts = usage.map((item) => `• ${item}`);
    const details = [
      category ? `التصنيف: ${category}` : "",
      ...facts,
      ...(usageFacts.length
        ? ["طريقة الاستخدام الموثّقة:", ...usageFacts]
        : []),
      product.sourceUrl?.trim()
        ? `مصدر المعلومات: ${product.sourceUrl.trim()}`
        : "",
    ].filter(Boolean);

    const body = [hook, ...details, cta].join("\n\n");
    const specificHashtags = [
      category ? `#${category.replace(/\s+/g, "_")}` : "",
      headline ? `#${headline.split(/\s+/)[0]}` : "",
    ].filter(Boolean);
    const hashtags = Array.from(
      new Set([...specificHashtags, ...AL_RAHMA_BRAND_CONFIG.hashtags]),
    ).slice(0, 15);
    const fullPostText = `${headline}\n\n${body}\n\n${hashtags.join(" ")}`;

    return {
      headline,
      hook,
      benefitLine,
      body,
      cta,
      ctaShort,
      hashtags,
      fullPostText,
    };
  }
}
