import { GeneratedArabicCopy, ProductDetails } from "./arabic-copywriter";
import {
  OccasionGreetingInput,
  PromotionEvaluation,
} from "./commercial";
import { OverlayOptions } from "./overlay-system";

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
  "مجانا 100% بدون أي مقابل",
  "اكسب فلوس",
  "سحر خيالي غير حقيقي",
  "مضمون يشفي جميع الأمراض",
  "بدون أي أعراض جانبية",
  "نتيجة مضمونة",
];

const CTA_REQUIRED_KEYWORDS = ["اطلب", "رسالة", "خاص", "واتساب", "تواصل", "احجز"];

/** Pricing, discount and urgency language is never allowed in the composer. */
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
  "اطلب الآن قبل",
  "EGP",
  "LE ",
];

const PERCENTAGE_PATTERN = /[%٪]/;

export class QualityGate {
  /**
   * فحص شامل للمحتوى والتصميم قبل النشر لضمان معايير الجودة والتحويل
   */
  public static evaluate(
    copy: GeneratedArabicCopy,
    product: ProductDetails,
    visual?: OverlayOptions,
    commercial?: CommercialContext,
  ): QualityGateReport {
    const checks: QualityCheckResult[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. فحص العنوان الرئيسي (Headline check)
    const wordsInHeadline = copy.headline.trim().split(/\s+/).filter(Boolean)
      .length;
    const headlineOk = wordsInHeadline >= 2 && wordsInHeadline <= 20;
    checks.push({
      checkName: "Headline Length & Clarity",
      category: "copy",
      passed: headlineOk,
      score: headlineOk ? 100 : 50,
      message: headlineOk
        ? `العنوان مناسب ومباشر (${wordsInHeadline} كلمات)`
        : `العنوان يحتاج ضبط (${wordsInHeadline} كلمات، المفضل بين 2 إلى 20 كلمة)`,
    });
    if (!headlineOk) warnings.push("يفضل اختصار أو توضيح العنوان الرئيسي");

    // 2. فحص الهوك وجذب الانتباه (Hook check)
    const hasHook = copy.hook.length >= 10;
    checks.push({
      checkName: "Attention Hook Presence",
      category: "copy",
      passed: hasHook,
      score: hasHook ? 100 : 30,
      message: hasHook
        ? "يوجد افتتاحية جذابة لجذب انتباه العميل"
        : "الافتتاحية مفقودة أو قصيرة جداً",
    });
    if (!hasHook) errors.push("يجب إضافة افتتاحية (Hook) قوية للبوست");

    // 3. فحص الدعوة لاتخاذ إجراء (CTA Check)
    const hasCta = CTA_REQUIRED_KEYWORDS.some(
      (kw) => copy.cta.includes(kw) || copy.body.includes(kw),
    );
    checks.push({
      checkName: "Call To Action (CTA)",
      category: "copy",
      passed: hasCta,
      score: hasCta ? 100 : 0,
      message: hasCta
        ? "يوجد طلب واضح ومحدد لاتخاذ إجراء (CTA)"
        : "البوست يفتقر لـ CTA واضح (اطلب / تواصل / واتساب)",
    });
    if (!hasCta) errors.push("البوست يفتقر لدعوة واضحة لاتخاذ إجراء (Call to Action)");

    // 4. Verify that advertised product information has a verified source.
    const hasVerifiedSource =
      product.verificationStatus === "verified" &&
      Boolean(product.sourceUrl?.trim());
    checks.push({
      checkName: "Verified Product Source",
      category: "compliance",
      passed: hasVerifiedSource,
      score: hasVerifiedSource ? 100 : 0,
      message: hasVerifiedSource
        ? "المنتج مرتبط بمصدر موثّق."
        : "لا يمكن اعتماد الإعلان قبل توثيق مصدر معلومات المنتج.",
    });
    if (!hasVerifiedSource) {
      errors.push("يجب توثيق مصدر معلومات المنتج قبل اعتماد الإعلان.");
    }

    // 5. The hero element must be the authentic packshot, never generated art.
    const hasPackshot = Boolean(product.productImageUrl?.trim());
    checks.push({
      checkName: "Authentic Reference Packshot",
      category: "visual",
      passed: hasPackshot,
      score: hasPackshot ? 100 : 0,
      message: hasPackshot
        ? "صورة المنتج الأصلية متاحة وستُركَّب كما هي."
        : "لا يمكن إنشاء إعلان بدون صورة المنتج الأصلية.",
    });
    if (!hasPackshot) {
      errors.push("يجب إضافة صورة المنتج الأصلية (packshot) قبل إنشاء الإعلان.");
    }

    // 6. No pricing, discount or urgency language is allowed.
    const pricingSource = `${copy.headline}\n${copy.fullPostText}`;
    const foundPricing = PRICING_TERMS.filter((term) =>
      pricingSource.includes(term),
    );
    if (PERCENTAGE_PATTERN.test(pricingSource)) foundPricing.push("نسبة مئوية");
    const noPricing = foundPricing.length === 0;
    checks.push({
      checkName: "No Price Or Discount Claims",
      category: "compliance",
      passed: noPricing,
      score: noPricing ? 100 : 0,
      message: noPricing
        ? "النص خالٍ من الأسعار والخصومات والعروض."
        : `تم رصد لغة سعرية أو ترويجية غير مسموحة: ${foundPricing.join(", ")}`,
    });
    if (!noPricing) {
      errors.push("احذف أي أسعار أو خصومات أو إلحاح غير موثّق من النص.");
    }

    // 6b. Controlled promotion: the only allowed way to show a price.
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
            ? `عرض سعري موثّق من سجل العروض النشط (خصم ${promotion.promotion.discountPercent}%).`
            : promotion.status === "invalid"
              ? promotion.reason
              : promotion.status === "scheduled"
                ? "العرض لم يبدأ بعد؛ تم الرجوع إلى النمط بدون سعر."
                : "انتهى العرض؛ تم الرجوع تلقائياً إلى النمط بدون سعر.",
      });
      if (!promotionOk) {
        errors.push(
          "لا يمكن عرض سعر غير متوافق مع سجل العروض؛ راجع بيانات العرض.",
        );
      }
    }

    // 6c. Cultural greeting must stay a tasteful, in-window greeting.
    if (commercial?.occasion) {
      const greeting = commercial.occasion.greeting.trim();
      const occasionOk =
        greeting.startsWith("كل عام") && greeting.length <= 120;
      checks.push({
        checkName: "Cultural Occasion Greeting",
        category: "copy",
        passed: occasionOk,
        score: occasionOk ? 100 : 40,
        message: occasionOk
          ? `تهنئة مناسبة لـ ${commercial.occasion.occasionName} مضافة إلى التصميم.`
          : "صيغة التهنئة غير مناسبة؛ استخدم تهنئة عربية مهذبة قصيرة.",
      });
      if (!occasionOk) {
        warnings.push("راجع صيغة تهنئة المناسبة قبل النشر.");
      }
    }

    // 7. فحص الكلمات المحظورة والمضللة (Compliance & Spam)
    const foundBanned = BANNED_TERMS.filter((term) =>
      copy.fullPostText.includes(term),
    );
    const complianceOk = foundBanned.length === 0;
    checks.push({
      checkName: "Spam & Compliance Filter",
      category: "compliance",
      passed: complianceOk,
      score: complianceOk ? 100 : 0,
      message: complianceOk
        ? "النص خالٍ من أي عبارات مضللة أو محظورة"
        : `تم رصد عبارات مضللة: ${foundBanned.join(", ")}`,
    });
    if (!complianceOk) {
      errors.push(`احذف العبارات المضللة: ${foundBanned.join(", ")}`);
    }

    // 8. فحص الهاشتاجات (Hashtag Hygiene)
    const hasTags = copy.hashtags.length >= 3 && copy.hashtags.length <= 15;
    checks.push({
      checkName: "Hashtag Optimization",
      category: "copy",
      passed: hasTags,
      score: hasTags ? 100 : 60,
      message: hasTags
        ? `عدد الهاشتاجات مثالي (${copy.hashtags.length} هاشتاج)`
        : `عدد الهاشتاجات (${copy.hashtags.length}) خارج النطاق الموصى به (3-15)`,
    });

    // 9. فحص الأبعاد والتنسيق البصري (إذا تم تمريره)
    if (visual) {
      const width = visual.width ?? 0;
      const height = visual.height ?? 0;
      const validDimensions = width >= 500 && height >= 500;
      checks.push({
        checkName: "Visual Resolution & Safe Zones",
        category: "visual",
        passed: validDimensions,
        score: validDimensions ? 100 : 40,
        message: validDimensions
          ? `الأبعاد ملائمة للتصاميم عالية الجودة (${width}x${height})`
          : "أبعاد الصورة صغيرة جداً",
      });
      if (!validDimensions) errors.push("أبعاد الصورة غير ملائمة للنشر الاحترافي");
    }

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
