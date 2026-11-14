import { AL_RAHMA_BRAND_CORE } from "./brand-core";

export type PostAngle =
  | "flash_sale"        // عرض تخفيض قوي وسريع
  | "product_features"   // شرح مواصفات وجودة المنتج
  | "home_solution"      // حل مشكلة في البيت
  | "combo_deal"         // عرض باقة وتوفير
  | "trust_guarantee";   // تركيز على المعاينة والضمان

export interface ProductDetails {
  title: string;
  category: string;
  originalPrice?: number;
  salePrice: number;
  currency?: string;
  features: string[];
  urgencyNote?: string;
  badgeText?: string;
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
    "🔥 أقوى عرض في مصر من مخزن الرحمة.. السعر اتكسر حرفياً!",
    "🚨 عرض خاص جداً ومحدود.. وفر فلوسك وجهز بيتك بأشيك شكل!",
    "💥 الحق العرض قبل ما يخلص! السعر ده مش هيتكرر تاني نهائي.",
  ],
  product_features: [
    "✨ بتدوري على الجودة اللي تعيش معاكي والشياكة في نفس الوقت؟",
    "👌 الجودة الحقيقية بتبان من أول استخدام.. شوفي مميزات المنتج ده بنفسك!",
    "🌟 حل عملي ومميز لكل ست بيت ذكية بتدور على الأفضل وبسعر التوفير.",
  ],
  home_solution: [
    "🏡 لو عايز توفر مساحة وتخلي بيتك مترتب وشيك طول الوقت.. الحل هنا!",
    "💡 منتج هيغير روتين بيتك وهيريحك ويوفر وقتك ومجهودك يومياً.",
    "🛋️ جمال وأناقة بيتك مش محتاج ميزانية ضخمة.. الذكاء في اختيار الأنسب!",
  ],
  combo_deal: [
    "🎁 باقة التوفير الكبرى من مخزن الرحمة.. اشتري ووفّر أكثر من الضعف!",
    "🎉 عرض الجملة وصل لحد عندك.. وفر كتير مع باقات عروض الرحمة الحصرية.",
    "🛒 لمينا لك أهم مستلزمات البيت في عرض واحد بسعر خيالي!",
  ],
  trust_guarantee: [
    "🛡️ اطلب وإنت مطمن 100%.. متاح المعاينة والتجربة قبل ما تدفع أي جنيه!",
    "🤝 ثقتكم ورضاكم أهم من أي مكسب.. شحن سريع ومعاينة حرة عند الاستلام.",
    "🚚 طلبك بيوصلك لحد باب بيتك مغلف ومضمون وبأعلى درجات الأمان.",
  ],
};

const CTA_OPTIONS = [
  "📩 للطلب السريع: ابعتلنا رسالة على الخاص دلوقتي أو من خلال الواتساب.",
  "📲 اضغط على زر إرسال رسالة وطلبك هيتسجل فوراً قبل نفاذ الكمية.",
  "💬 كلمنا على الخاص وخدمة العملاء هترد عليك خلال دقائق بالأسعار والتفاصيل.",
];

export class ArabicCopywriter {
  /**
   * توليد بوست كامل متناسق وموجّه تسويقياً للجمهور المصري
   */
  public static generatePost(product: ProductDetails, angle: PostAngle = "flash_sale"): GeneratedArabicCopy {
    const currency = product.currency || "ج.م";
    const hooks = HOOKS_BY_ANGLE[angle];
    const hook = hooks[Math.floor(Math.random() * hooks.length)];

    let savingsText = "";
    if (product.originalPrice && product.originalPrice > product.salePrice) {
      const diff = product.originalPrice - product.salePrice;
      const percentage = Math.round((diff / product.originalPrice) * 100);
      savingsText = `خصم ${percentage}% (وفرت ${diff} ${currency})`;
    }

    const priceTag = product.originalPrice && product.originalPrice > product.salePrice
      ? `السعر قبل العرض: ${product.originalPrice} ${currency} ❌\nالسعر في العرض الآن: ${product.salePrice} ${currency} فقط! ✅`
      : `السعر: ${product.salePrice} ${currency} فقط! ✅`;

    const featuresList = product.features
      .map((f) => `  ▫️ ${f}`)
      .join("\n");

    const headline = product.badgeText || (savingsText ? `${product.title} - ${savingsText}` : product.title);
    const cta = CTA_OPTIONS[Math.floor(Math.random() * CTA_OPTIONS.length)];

    const urgency = product.urgencyNote || "⚠️ الكميات محدودة جداً نظراً للإقبال الشديد.. الأولوية لأسبقية الحجز!";

    const body = `
${hook}

📌 مواصفات ومميزات المنتج:
${featuresList}

💰 تفاصيل الأسعار والعرض:
${priceTag}
${savingsText ? `🎁 ${savingsText}` : ""}

${urgency}

🛡️ مميزات الشراء من مخزن الرحمة:
  ✅ معاينة الشحنة قبل الاستلام والدفع عند التأكد من الجودة.
  ✅ شحن فوري لجميع محافظات مصر.
  ✅ خدمة ما بعد البيع ودعم مستمر.

${cta}
`.trim();

    const specificHashtags = [
      `#${product.category.replace(/\s+/g, "_")}`,
      `#${product.title.split(" ")[0] || "منتجات"}`,
    ];
    const allHashtags = Array.from(new Set([...specificHashtags, ...AL_RAHMA_BRAND_CORE.defaultHashtags]));

    const fullPostText = `${headline}\n\n${body}\n\n${allHashtags.join(" ")}`;

    return {
      headline,
      hook,
      body,
      cta,
      priceTag,
      savingsText,
      hashtags: allHashtags,
      fullPostText,
    };
  }
}

