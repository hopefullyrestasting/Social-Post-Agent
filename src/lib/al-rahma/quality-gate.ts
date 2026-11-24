import { GeneratedArabicCopy, ProductDetails } from "./arabic-copywriter";
import { AL_RAHMA_BRAND_CONFIG, buildBrandConfigFromTenant, type BrandConfig, type TenantBrandContext } from "./brand-core";
import { OccasionGreetingInput, PromotionEvaluation } from "./commercial";
import { OverlayOptions } from "./overlay-system";
import { isSafeOfferText, isSafeSalesLine, isValidPriceText } from "./studio-fields";

export interface QualityCheckResult {
  checkName: string;
  category: "copy" | "visual" | "compliance";
  passed: boolean;
  score: number; // 0 - 100
  message: string;
}

export interface QualityGateReport {
  passed: boolean;
  overallScore: number;
  checks: QualityCheckResult[];
  errors: string[];
  warnings: string[];
  timestamp: string;
}

/**
 * Commercial inputs already classified by `evaluatePromotion`. Pricing is a
 * controlled exception: only an active, numerically consistent promotion may
 * render a price. Anything else reverts to price-free or fails the gate.
 */
export interface CommercialContext {
  promotion?: PromotionEvaluation;
  occasion?: OccasionGreetingInput | null;
}

const BANNED_TERMS = [
  "نتائج مضمونة 100%",
  "علاج نهائي",
  "بدون أي آثار جانبية",
  "بدون أي مخاطر",
];

const CTA_REQUIRED_KEYWORDS = ["اطلب", "تواصل", "واتساب", "اتصل", "راسل", "احجز"];

const PRICING_TERMS = [
  "خصم",
  "تخفيض",
  "السعر",
  "سعر",
  "جنيه",
  "ج.م",
  "عرض خاص",
  "لفترة محدودة",
  "الكمية محدودة",
  "EGP",
  "LE ",
];

const PERCENTAGE_PATTERN = /[%٪]/;

export class QualityGate {
  public static evaluate(
    copy: GeneratedArabicCopy,
    product: ProductDetails,
    visual?: OverlayOptions,
    commercial?: CommercialContext,
  ): QualityGateReport {
    const checks: QualityCheckResult[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Headline clarity
    const wordsInHeadline = copy.headline.trim().split(/\s+/).filter(Boolean).length;
    const headlineOk = wordsInHeadline >= 2 && wordsInHeadline <= 20;
    checks.push({
      checkName: "Headline Length & Clarity",
      category: "copy",
      passed: headlineOk,
      score: headlineOk ? 100 : 50,
      message: headlineOk
        ? `عنوان مناسب (${wordsInHeadline} كلمات)`
        : `يفضل تعديل العنوان (${wordsInHeadline} كلمات)`,
    });
    if (!headlineOk) warnings.push("يفضل اختيار عنوان أوضح.");

    // 2. Hook
    const hasHook = copy.hook.trim().length >= 10;
    checks.push({
      checkName: "Attention Hook Presence",
      category: "copy",
      passed: hasHook,
      score: hasHook ? 100 : 30,
      message: hasHook ? "يوجد خطاف افتتاحي مناسب." : "الافتتاحية قصيرة جداً.",
    });
    if (!hasHook) errors.push("يجب إضافة افتتاحية (Hook) قوية.");

    // 3. CTA
    const hasCta = CTA_REQUIRED_KEYWORDS.some(
      (kw) => copy.cta.includes(kw) || copy.body.includes(kw) || copy.ctaShort.includes(kw),
    );
    checks.push({
      checkName: "Call To Action (CTA)",
      category: "copy",
      passed: hasCta,
      score: hasCta ? 100 : 0,
      message: hasCta ? "يوجد طلب واضح للتواصل (CTA)." : "النص يفتقد دعوة واضحة للتواصل.",
    });
    if (!hasCta) errors.push("يجب إضافة دعوة واضحة للتواصل (CTA).");

        // 3b. Sales copy length (4-8 words, benefit-only copy)
    const benefitWords = copy.benefitLine.trim().split(/\s+/).filter(Boolean).length;
    const benefitOk = benefitWords >= 4 && benefitWords <= 8;
    checks.push({
      checkName: "Sales Copy Length",
      category: "copy",
      passed: benefitOk,
      score: benefitOk ? 100 : 40,
      message: benefitOk
        ? `جملة البيع مناسبة (${benefitWords} كلمات)`
        : `جملة البيع يجب أن تكون من 4 إلى 8 كلمات (${benefitWords})`,
    });
    if (!benefitOk) errors.push("جملة البيع يجب أن تكون قصيرة من 4 إلى 8 كلمات.");

    // 4. Verified source
    const hasVerifiedSource =
      product.verificationStatus === "verified" && Boolean(product.sourceUrl?.trim());
    checks.push({
      checkName: "Verified Product Source",
      category: "compliance",
      passed: hasVerifiedSource,
      score: hasVerifiedSource ? 100 : 0,
      message: hasVerifiedSource
        ? "المنتج مرتبط بمصدر موثّق."
        : "لا يمكن اعتماد معلومات المنتج بدون مصدر موثّق.",
    });
    if (!hasVerifiedSource) {
      errors.push("يجب توفر مصدر موثّق لمعلومات المنتج قبل اعتماد الإعلان.");
    }

    // 5. Authentic packshot
    const hasPackshot = Boolean(product.productImageUrl?.trim());
    checks.push({
      checkName: "Authentic Reference Packshot",
      category: "visual",
      passed: hasPackshot,
      score: hasPackshot ? 100 : 0,
      message: hasPackshot
        ? "صورة المنتج الأصلية متاحة للتركيب."
        : "لا يمكن إنشاء الإعلان بدون صورة المنتج الأصلية.",
    });
    if (!hasPackshot) {
      errors.push("يجب إضافة صورة المنتج الأصلية (packshot) قبل إنشاء الإعلان.");
    }

    // 6. No invented pricing/discount/urgency language in copy
    const pricingSource = `${copy.headline}\n${copy.benefitLine}\n${copy.fullPostText}`;
    const foundPricing = PRICING_TERMS.filter((term) => pricingSource.includes(term));
    if (PERCENTAGE_PATTERN.test(pricingSource)) foundPricing.push("نسبة مئوية");
    // Pricing terms in copy are not allowed even with active promotion (badge handles price)
    const noPricing = foundPricing.length === 0;
    checks.push({
      checkName: "No Price Or Discount Claims",
      category: "compliance",
      passed: noPricing,
      score: noPricing ? 100 : 0,
      message: noPricing
        ? "النص خالٍ من ادعاءات الأسعار والخصومات غير المصرح بها."
        : `تم رصد لغة سعرية/ترويجية في النص: ${foundPricing.join(", ")}`,
    });
    if (!noPricing) {
      errors.push("احذف أي أسعار أو خصومات أو إلحاح غير موثّق من النص.");
    }

    // 6b. Controlled promotion validation (pricing allowed only as validated badge)
    if (commercial?.promotion && commercial.promotion.status !== "none") {
      const promotion = commercial.promotion;
      const promotionOk = promotion.status !== "invalid";
      checks.push({
        checkName: "Controlled Promotion Pricing",
        category: "compliance",
        passed: promotionOk,
        score: promotionOk ? 100 : 0,
        message:
          promotion.status === "active"
            ? `عرض سعري موثّق من سجل العروض (خصم ${promotion.promotion.discountPercent}%).`
            : promotion.status === "invalid"
              ? promotion.reason
              : promotion.status === "scheduled"
                ? "العرض لم يبدأ بعد؛ لن يُعرض السعر."
                : "انتهى العرض؛ لن يُعرض السعر.",
      });
      if (!promotionOk) {
        errors.push("لا يمكن عرض سعر غير متوافق مع سجل العروض.");
      }
    }

    // 6b-2. Optional studio metadata is explicit, claim-free and bounded.
    // These values are rendered only as controlled visual metadata; they never
    // relax the copy-side pricing/benefit checks above.
    const salesLineOk = !product.salesLine?.trim() || isSafeSalesLine(product.salesLine);
    const priceTextOk = !visual?.priceText?.trim() || isValidPriceText(visual.priceText);
    const offerTextOk = !visual?.offerText?.trim() || isSafeOfferText(visual.offerText);
    const metadataOk = salesLineOk && priceTextOk && offerTextOk;
    checks.push({
      checkName: "Optional Studio Metadata",
      category: "compliance",
      passed: metadataOk,
      score: metadataOk ? 100 : 0,
      message: metadataOk
        ? "اختياري: السعر والعرض وسطر البيع صريح وخالٍ من الادعاءات غير الموثّقة."
        : "رُفضت بيانات اختيارية غير صالحة أو ادعائية؛ يجب إزالتها قبل النشر.",
    });
    if (!metadataOk) {
      errors.push("بيانات السعر أو العرض أو سطر البيع غير صالحة؛ أزل النص الادعائي.");
    }

    // 6c. Cultural greeting
    if (commercial?.occasion) {
      const greeting = commercial.occasion.greeting.trim();
      const occasionOk = greeting.startsWith("كل عام") && greeting.length <= 120;
      checks.push({
        checkName: "Cultural Occasion Greeting",
        category: "copy",
        passed: occasionOk,
        score: occasionOk ? 100 : 40,
        message: occasionOk
          ? `تهنئة مناسبة لـ ${commercial.occasion.occasionName}.`
          : "صيغة تهنئة المناسبة غير صالحة.",
      });
      if (!occasionOk) warnings.push("راجع صيغة تهنئة المناسبة.");
    }

    // 7. Banned terms
    const foundBanned = BANNED_TERMS.filter((term) => copy.fullPostText.includes(term));
    const complianceOk = foundBanned.length === 0;
    checks.push({
      checkName: "Spam & Compliance Filter",
      category: "compliance",
      passed: complianceOk,
      score: complianceOk ? 100 : 0,
      message: complianceOk
        ? "النص خالٍ من العبارات المضللة المحظورة."
        : `تم رصد عبارات محظورة: ${foundBanned.join(", ")}`,
    });
    if (!complianceOk) {
      errors.push(`احذف العبارات المحظورة: ${foundBanned.join(", ")}`);
    }

    // 8. Hashtags
    const hasTags = copy.hashtags.length >= 3 && copy.hashtags.length <= 15;
    checks.push({
      checkName: "Hashtag Optimization",
      category: "copy",
      passed: hasTags,
      score: hasTags ? 100 : 60,
      message: hasTags
        ? `عدد الهاشتاجات مناسب (${copy.hashtags.length}).`
        : `عدد الهاشتاجات (${copy.hashtags.length}) خارج النطاق الموصى به (3-15).`,
    });

    // 9. Visual dimensions
    if (visual) {
      const width = visual.width ?? AL_RAHMA_BRAND_CONFIG.visual.format.width;
      const height = visual.height ?? AL_RAHMA_BRAND_CONFIG.visual.format.height;
      const validDimensions = width >= 500 && height >= 500;
      checks.push({
        checkName: "Visual Resolution & Safe Zones",
        category: "visual",
        passed: validDimensions,
        score: validDimensions ? 100 : 40,
        message: validDimensions
          ? `أبعاد التصميم مناسبة (${width}x${height}).`
          : "أبعاد الصورة غير مناسبة.",
      });
      if (!validDimensions) errors.push("أبعاد الصورة غير مناسبة للنشر.");
    }

    // 10. Brand identity contract (dynamic tenant branding allowed)
    const brand = ((visual as unknown as Record<string, unknown>)?.brand as Record<string, unknown> | undefined) && "brandName" in (((visual as unknown as Record<string, unknown>)?.brand as Record<string, unknown>) || {})
      ? (((visual as unknown as Record<string, unknown>).brand) as unknown as BrandConfig)
      : buildBrandConfigFromTenant(((visual as unknown as Record<string, unknown>)?.brand) as unknown as TenantBrandContext | null | undefined);
    const brandOk = Boolean(brand.brandName?.trim());
    checks.push({
      checkName: "Brand Identity Contract",
      category: "compliance",
      passed: brandOk,
      score: brandOk ? 100 : 0,
      message: brandOk ? "هوية العلامة التجارية متوفرة." : "هوية العلامة التجارية مفقودة.",
    });
    if (!brandOk) errors.push("هوية العلامة التجارية مطلوبة.");

    const totalScore = Math.round(
      checks.reduce((acc, c) => acc + c.score, 0) / checks.length,
    );
    const passed = errors.length === 0 && totalScore >= 75;

    return {
      passed,
      overallScore: totalScore,
      checks,
      errors,
      warnings,
      timestamp: new Date().toISOString(),
    };
  }
}
