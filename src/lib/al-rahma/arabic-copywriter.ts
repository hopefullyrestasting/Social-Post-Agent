import { AL_RAHMA_BRAND_CONFIG } from "./brand-core";

/**
 * Arabic copy for the pro designer WhatsApp Status composer.
 *
 * Rules enforced here:
 * - No prices, discounts, urgency or shipping promises.
 * - Benefits/usage lines are only rendered from claims the caller already
 *   verified against a source (see `product-research-verifier`).
 * - Sales copy shown on creative is short, punchy Egyptian commercial Arabic,
 *   strictly 4 to 9 words.
 * - Output is deterministic so the same product + variant always produces the
 *   same creative (no `Math.random`).
 */

export type PostAngle =
  | "product_features"
  | "beauty_routine"
  | "combo_deal"
  | "product_information";

export type WarehouseStockStatus = "in_stock" | "out_of_stock" | "unknown";

export type CopyVariant = 1 | 2;

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
  /** In-window cultural greeting prepended to the post body. */
  occasionGreeting?: string;
}

export interface GeneratedArabicCopy {
  headline: string;
  hook: string;
  /** Prominent sales copy (4-9 words) shown on the creative. */
  benefitLine: string;
  body: string;
  cta: string;
  ctaShort: string;
  hashtags: string[];
  fullPostText: string;
}

const CTA_TEMPLATES: [string, string] = [
  "للطلب والاستفسار: اتصل بنا على {{phone}} أو ابعتلنا رسالة على واتساب.",
  "عايز تعرف تفاصيل أكتر؟ تواصل معنا على {{phone}}.",
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

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function clampWords(text: string, min: number, max: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length > max) return words.slice(0, max).join(" ");
  if (words.length >= min) return words.join(" ");

  // Pad deterministically with generic commercial words when too short.
  const fillers = ["من", "مخزن", "الرحمة", "بجودة", "مميزة", "لك", "الآن", "متاح"];
  const result = [...words];
  for (const filler of fillers) {
    if (result.length >= min) break;
    if (!result.includes(filler)) result.push(filler);
  }
  // If still short (unlikely), repeat safe generic tail
  while (result.length < min) result.push("الآن");
  return result.slice(0, max).join(" ");
}

function categoryLabel(category: string): string {
  const normalized = (category || "").trim().replaceAll("_", " ");
  if (!normalized) return "منتجات العناية";
  return normalized;
}

function deriveSalesCopy(
  product: ProductDetails,
  variant: CopyVariant,
): string {
  const benefits = clean(product.verifiedBenefits);
  const usage = clean(product.verifiedUsage);
  const category = categoryLabel(product.category);
  const name = (product.badgeText || product.title || "").trim().split(/\s+/).slice(0, 2).join(" ");

  const candidates = [
    benefits[0] ?? "",
    benefits[1] ?? usage[0] ?? "",
    `${name} ${category}`.trim(),
    `عناية مميزة من ${AL_RAHMA_BRAND_CONFIG.brandName}`,
  ].map((s) => s.trim()).filter(Boolean);

  const picked = candidates[variant - 1] ?? candidates[0] ?? category;
  return clampWords(picked, 4, 9);
}

function buildHeadline(product: ProductDetails): string {
  const raw = (product.badgeText || product.title || "").trim();
  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return raw;
  const category = categoryLabel(product.category);
  return `${raw} ${category}`.trim();
}

export class ArabicCopywriter {
  public static generatePost(
    product: ProductDetails,
    angle: PostAngle = "product_information",
    options: CopyOptions = {},
  ): GeneratedArabicCopy {
    void angle;
    const variant: CopyVariant = options.variant ?? 1;
    const cta = renderTemplate(
      CTA_TEMPLATES[(options.ctaIndex ?? variant - 1) % CTA_TEMPLATES.length],
    );
    const ctaShort = renderTemplate(
      CTA_SHORT_TEMPLATES[(options.ctaIndex ?? variant - 1) % CTA_SHORT_TEMPLATES.length],
    );

    const benefitLine = deriveSalesCopy(product, variant);
    const headline = buildHeadline(product);
    const category = categoryLabel(product.category);
    const greeting = (options.occasionGreeting ?? "").trim();
    const facts = clean(product.features).map((feature) => `• ${feature}`);
    const usageFacts = clean(product.verifiedUsage).map((item) => `• ${item}`);
    const hook =
      variant === 1
        ? `اختار المنتج المناسب ليك من ${AL_RAHMA_BRAND_CONFIG.brandName}.`
        : `جودة مميزة وعرض أنيق من ${AL_RAHMA_BRAND_CONFIG.brandName}.`;
    const details = [
      category ? `القسم: ${category}` : "",
      ...facts,
      ...(usageFacts.length ? ["طريقة الاستخدام الموثّقة:", ...usageFacts] : []),
      product.sourceUrl?.trim()
        ? `مصدر المعلومة: ${product.sourceUrl.trim()}`
        : "",
    ].filter(Boolean);

    const body = [greeting, hook, benefitLine, ...details, cta]
      .filter(Boolean)
      .join("\n\n");
    const specificHashtags = [
      category ? `#${category.replace(/\s+/g, "_")}` : "",
      headline ? `#${headline.split(/\s+/)[0]}` : "",
    ].filter(Boolean);
    const hashtags = Array.from(
      new Set([...specificHashtags, ...AL_RAHMA_BRAND_CONFIG.hashtags]),
    ).slice(0, 15);
    const fullPostText = `${headline}\n\n${body}\n\n${hashtags.join(" ")}`;

    // Safety: ensure benefitLine is 4-9 words
    const finalBenefit = clampWords(benefitLine, 4, 9);

    return {
      headline,
      hook,
      benefitLine: finalBenefit,
      body,
      cta,
      ctaShort,
      hashtags,
      fullPostText,
    };
  }

  public static countWords(text: string): number {
    return countWords(text);
  }
}
