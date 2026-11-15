export interface BrandCoreConfig {
  brandName: string;
  brandNameEnglish: string;
  industry: string;
  tagline: string;
  taglineEnglish: string;
  valueProposition: string;
  toneOfVoice: string[];
  brandPersonality: string[];
  targetAudience: string;
  keyMessages: string[];
  primaryColors: {
    emerald: string;
    darkEmerald: string;
    amber: string;
    slate: string;
  };
  secondaryColors: {
    white: string;
    offWhite: string;
    lightGray: string;
    alertRed: string;
  };
  fonts: {
    primary: string;
    secondary: string;
  };
  imageryStyle: string;
  layoutStyle: string;
  contactInfo: {
    phone: string;
    whatsapp: string;
    deliveryPromise: string;
    returnPolicy: string;
  };
  defaultHashtags: string[];
}

export const AL_RAHMA_BRAND_CORE: BrandCoreConfig = {
  brandName: "مخزن الرحمة",
  brandNameEnglish: "Al-Rahma Store",
  industry:
    "مستحضرات التجميل والعناية بالشعر والبشرة والعناية الشخصية والعطور والمستلزمات الطبية",
  tagline: "منتجات العناية والجمال والمستلزمات الطبية لدى مخزن الرحمة",
  taglineEnglish: "Beauty, Personal Care, Fragrance and Pharmacy Supplies",
  valueProposition:
    "نوفر مستحضرات التجميل والعناية الشخصية والعطور والمستلزمات الطبية، مع التواصل المباشر للاستفسار عن التوفر والعروض.",
  toneOfVoice: [
    "ترويجي جذاب ومباشر",
    "ودود ومباشر ومناسب لعملاء الصيدليات ومحلات التجميل",
    "شفاف في الأسعار والمواصفات",
    "محفز للشراء بدون مبالغة زائفة",
    "موثوق ويذكر فقط معلومات المنتج التي تم التحقق منها",
  ],
  brandPersonality: [
    "مهني وموثوق",
    "قريب من أصحاب الصيدليات ومحلات التجميل",
    "واضح في التوفر والعروض",
    "ملتزم بدقة معلومات المنتج",
  ],
  targetAudience:
    "أصحاب الصيدليات ومحلات مستحضرات التجميل والعناية الشخصية والعطور، والعملاء الباحثون عن هذه المنتجات.",
  keyMessages: [
    "المنتج اللي بتدور عليه تلاقيه في مخزن الرحمة.",
    "اسألنا عن التوفر والعروض على منتجات العناية والجمال.",
    "مستلزمات التجميل والعناية الشخصية والعطور في مكان واحد.",
    "للطلب والاستفسار تواصل معنا على الهاتف أو واتساب.",
  ],
  primaryColors: {
    emerald: "#059669",     // لون الرحمة والنماء
    darkEmerald: "#065f46", // للتباين والنصوص والظلال
    amber: "#F59E0B",       // للشارات وعروض الخصم
    slate: "#0F172A",       // للنصوص الرئيسية والخلفيات الداكنة
  },
  secondaryColors: {
    white: "#FFFFFF",
    offWhite: "#F8FAFC",
    lightGray: "#E2E8F0",
    alertRed: "#DC2626",    // لخصومات الـ Flash Deals والشارات العاجلة
  },
  fonts: {
    primary: "'Cairo', 'Tajawal', sans-serif",
    secondary: "'Segoe UI', 'Roboto', sans-serif",
  },
  imageryStyle:
    "صور حية فائقة الوضوح للمنتج مع خلفية استوديو نظيفة أو بيئة استخدام واقعية، إضاءة واضحة بدون ظلال مشوهة، إبراز خامات المنتج وتفاصيله الحقيقية.",
  layoutStyle:
    "تصميم عصري منظم ومريح بصرياً، يبرز صورة المنتج في المنتصف مع شارة خصم بارزة وشارة سعر واضحة، وشريط ثقة سفلي للمعاينة والتوصيل.",
  contactInfo: {
    phone: "01000017548",
    whatsapp: "https://wa.me/20100017548",
    deliveryPromise: "يتم تأكيد تفاصيل التوصيل عند التواصل",
    returnPolicy: "تُحدد سياسة الاستبدال والاسترجاع من إدارة المخزن",
  },
  defaultHashtags: [
    "#مخزن_الرحمة",
    "#عروض_الرحمة",
    "#مستحضرات_تجميل",
    "#العناية_بالشعر",
    "#العناية_بالبشرة",
    "#عناية_شخصية",
    "#عطور",
    "#مستلزمات_صيدليات",
    "#مستلزمات_طبية",
  ],
};

