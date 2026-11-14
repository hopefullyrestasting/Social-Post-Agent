import { GeneratedArabicCopy, ProductDetails } from "./arabic-copywriter";
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

const BANNED_TERMS = [
  "مجانا 100% بدون أي مقابل",
  "اكسب فلوس",
  "سحر خيالي غير حقيقي",
  "مضمون يشفي جميع الأمراض",
];

const CTA_REQUIRED_KEYWORDS = ["اطلب", "رسالة", "خاص", "واتساب", "تواصل", "احجز"];
const TRUST_REQUIRED_KEYWORDS = ["معاينة", "استلام", "شحن", "ضمان", "جودة"];

export class QualityGate {
  /**
   * فحص شامل للمحتوى والتصميم قبل النشر لضمان معايير الجودة والتحويل
   */
  public static evaluate(copy: GeneratedArabicCopy, product: ProductDetails, visual?: OverlayOptions): QualityGateReport {
    const checks: QualityCheckResult[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. فحص العنوان الرئيسي (Headline check)
    const wordsInHeadline = copy.headline.trim().split(/\s+/).length;
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
      message: hasHook ? "يوجد افتتاحية جذابة لجذب انتباه العميل" : "الافتتاحية مفقودة أو قصيرة جداً",
    });
    if (!hasHook) errors.push("يجب إضافة افتتاحية (Hook) قوية للبوست");

    // 3. فحص الدعوة لاتخاذ إجراء (CTA Check)
    const hasCta = CTA_REQUIRED_KEYWORDS.some((kw) => copy.cta.includes(kw) || copy.body.includes(kw));
    checks.push({
      checkName: "Call To Action (CTA)",
      category: "copy",
      passed: hasCta,
      score: hasCta ? 100 : 0,
      message: hasCta ? "يوجد طلب واضح ومحدد لاتخاذ إجراء (CTA)" : "البوست يفتقر لـ CTA واضح (اطلب / تواصل / واتساب)",
    });
    if (!hasCta) errors.push("البوست يفتقر لدعوة واضحة لاتخاذ إجراء (Call to Action)");

    // 4. فحص نقاط الثقة والضمان (Trust Factors)
    const hasTrust = TRUST_REQUIRED_KEYWORDS.some((kw) => copy.body.includes(kw));
    checks.push({
      checkName: "Trust & Assurance Points",
      category: "copy",
      passed: hasTrust,
      score: hasTrust ? 100 : 40,
      message: hasTrust ? "يحتوي البوست على نقاط ثقة وضمان للعميل (معاينة / شحن / استلام)" : "يفضل إضافة ميزة المعاينة قبل الاستلام لزيادة المبيعات",
    });
    if (!hasTrust) warnings.push("زيادة ثقة العميل بذكر المعاينة قبل الاستلام");

    // 5. فحص تطابق الأسعار (Price Consistency)
    const hasPriceMention = copy.body.includes(String(product.salePrice));
    checks.push({
      checkName: "Price Consistency",
      category: "copy",
      passed: hasPriceMention,
      score: hasPriceMention ? 100 : 20,
      message: hasPriceMention ? `تم ذكر السعر (${product.salePrice}) بوضوح في النص` : "لم يتم ذكر السعر بوضوح في محتوى البوست",
    });
    if (!hasPriceMention) warnings.push("عدم ذكر السعر قد يقلل من الشفافية");

    // 6. فحص الكلمات المحظورة والمضللة (Compliance & Spam)
    const foundBanned = BANNED_TERMS.filter((term) => copy.fullPostText.includes(term));
    const complianceOk = foundBanned.length === 0;
    checks.push({
      checkName: "Spam & Compliance Filter",
      category: "compliance",
      passed: complianceOk,
      score: complianceOk ? 100 : 0,
      message: complianceOk ? "النص خالٍ من أي عبارات مضللة أو محظورة" : `تم رصد عبارات مضللة: ${foundBanned.join(", ")}`,
    });
    if (!complianceOk) errors.push(`احذف العبارات المضللة: ${foundBanned.join(", ")}`);

    // 7. فحص الهاشتاجات (Hashtag Hygiene)
    const hasTags = copy.hashtags.length >= 3 && copy.hashtags.length <= 15;
    checks.push({
      checkName: "Hashtag Optimization",
      category: "copy",
      passed: hasTags,
      score: hasTags ? 100 : 60,
      message: hasTags ? `عدد الهاشتاجات مثالي (${copy.hashtags.length} هاشتاج)` : `عدد الهاشتاجات (${copy.hashtags.length}) خارج النطاق الموصى به (3-15)`,
    });

    // 8. فحص الأبعاد والتنسيق البصري (إذا تم تمريره)
    if (visual) {
      const validDimensions = visual.width >= 500 && visual.height >= 500;
      checks.push({
        checkName: "Visual Resolution & Safe Zones",
        category: "visual",
        passed: validDimensions,
        score: validDimensions ? 100 : 40,
        message: validDimensions ? `الأبعاد ملائمة للتصاميم عالية الجودة (${visual.width}x${visual.height})` : "أبعاد الصورة صغيرة جداً",
      });
      if (!validDimensions) errors.push("أبعاد الصورة غير ملائمة للنشر الاحترافي");
    }

    const totalScore = Math.round(checks.reduce((acc, c) => acc + c.score, 0) / checks.length);
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

