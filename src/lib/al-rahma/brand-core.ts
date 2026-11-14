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
  industry: "التجارة والتجزئة والسلع المنزلية والعروض العائلية",
  tagline: "أفضل جودة بأوفر سعر لكل بيت مصري",
  taglineEnglish: "Best Quality at the Best Price for Every Home",
  valueProposition:
    "نوفر لك مستلزمات البيت العصري وأفضل الأدوات والسلع بأسعار الجملة المباشرة، مع ميزة المعاينة قبل الاستلام والشحن السريع لجميع المحافظات.",
  toneOfVoice: [
    "ترويجي جذاب ومباشر",
    "ودود ومقرب من الأسرة المصرية",
    "شفاف في الأسعار والمواصفات",
    "محفز للشراء بدون مبالغة زائفة",
    "موثوق ويركز على الضمان والتوفير",
  ],
  brandPersonality: [
    "كريم وعملي",
    "قريب من المواطن",
    "صاحب أوفر الصفقات",
    "ملتزم بالجودة والخدمة",
  ],
  targetAudience:
    "العائلات المصرية، ربات البيوت، الشباب المقبلين على تجهيز الشقق، وكل متسوق يبحث عن قيمة حقيقية وسعر اقتصادي وجودة يعتمد عليها.",
  keyMessages: [
    "عروض مخزن الرحمة مبتخلصش.. وفر فلوسك وجهز بيتك بأشيك المنتجات.",
    "سعر الجملة من أول قطعة وجودة مضمونة 100%.",
    "عاين شحنتك براحتك قبل الدفع.. ثقتكم ورضاكم رقم 1 عندنا.",
    "شحن فوري وسريع لحد باب بيتك في جميع المحافظات.",
    "الكميات بتخلص بسرعة.. الحق العرض قبل نفاذ الكمية!",
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
    phone: "01000000000",
    whatsapp: "https://wa.me/201000000000",
    deliveryPromise: "شحن سريع لجميع محافظات مصر",
    returnPolicy: "متاح المعاينة قبل الاستلام والاسترجاع مجاناً",
  },
  defaultHashtags: [
    "#مخزن_الرحمة",
    "#عروض_الرحمة",
    "#تخفيضات_مصر",
    "#أدوات_منزلية",
    "#عروض_يومية",
    "#أوفر_سعر",
    "#تجهيز_شقق",
    "#تسوق_أونلاين",
  ],
};

