/**
 * Single source of truth for the Al Rahma Warehouse brand.
 *
 * This module is intentionally dependency-free and fully serializable: the
 * object below can be copied to JSON and used by UI, copywriting, overlays and
 * future agent-factory configurations without importing app code.
 *
 * Rule: phone numbers, WhatsApp links and brand names must live here only.
 * Everything else must read from `AL_RAHMA_BRAND_CONFIG`.
 */

export type BrandOrientation = "portrait" | "landscape" | "square";

export interface BrandFormat {
  width: number;
  height: number;
  orientation: BrandOrientation;
}

export interface BrandBackgroundRule {
  style: "clean-white";
  baseColor: string;
  mesh: {
    enabled: boolean;
    color: string;
    opacity: number;
  };
}

export interface BrandVisualTheme {
  themeName: string;
  background: BrandBackgroundRule;
  format: BrandFormat;
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
}

export interface BrandVoice {
  toneOfVoice: string[];
  brandPersonality: string[];
  targetAudience: string;
  keyMessages: string[];
}

export interface BrandContact {
  phone: string;
  whatsappUrl: string;
  deliveryPromise: string;
  returnPolicy: string;
  label: string;
}

/**
 * Commercial rendering rules. Kept inside the brand config so a future client
 * can swap currency, badge colors and calendar defaults without touching the
 * composer or the API layer.
 */
export interface BrandCommercialConfig {
  currencyLabel: string;
  timezone: string;
  calendar: {
    countryCode: string;
    defaultLeadDays: number;
    maxLeadDays: number;
  };
  promoBadge: {
    backgroundColor: string;
    accentColor: string;
    discountColor: string;
    textColor: string;
  };
  occasionRibbon: {
    backgroundColor: string;
    textColor: string;
  };
}

export interface BrandConfig {
  id: string;
  brandName: string;
  brandNameEnglish: string;
  legalName: string;
  activity: string;
  tagline: string;
  taglineEnglish: string;
  taglineShort: string;
  valueProposition: string;
  voice: BrandVoice;
  visual: BrandVisualTheme;
  contact: BrandContact;
  commercial: BrandCommercialConfig;
  hashtags: string[];
}

export const AL_RAHMA_BRAND_CONFIG: BrandConfig = {
  id: "al-rahma-warehouse",
  brandName: "مخزن الرحمة",
  brandNameEnglish: "Al Rahma Warehouse",
  legalName: "مخزن الرحمة للأدوية والمستلزمات الطبية ومستحضرات التجميل",
  activity: "مستحضرات تجميل ومستلزمات الصيدليات - متاح توصيل",
  tagline: "مستحضرات تجميل ومستلزمات الصيدليات - متاح توصيل",
  taglineEnglish: "Cosmetics and pharmacy supplies - delivery available",
  taglineShort: "مستحضرات تجميل ومستلزمات الصيدليات - متاح توصيل",
  valueProposition:
    "نوفر مستحضرات التجميل والعناية الشخصية والعطور ومستلزمات الصيدليات، مع التواصل المباشر للاستفسار عن التوفر والطلبات.",
  voice: {
    toneOfVoice: [
      "تجاري جذاب ومباشر",
      "ودود ومهني ومناسب لعملاء الصيدليات والتجميل",
      "واضح في الأسعار والمواصفات عند توفرها",
      "محترم للعملاء بدون مبالغة",
      "موثوق يذكر المعلومات المتاحة فقط",
    ],
    brandPersonality: [
      "عملي وموثوق",
      "قريب من احتياجات الصيدليات ومحلات التجميل",
      "واضح في التواصل والعرض",
      "ملتزم بدقة المعلومات المتاحة",
    ],
    targetAudience:
      "أصحاب الصيدليات ومحلات مستحضرات التجميل والعناية الشخصية والعطور، والعملاء الباحثون عن منتجات متاحة وموثوقة.",
    keyMessages: [
      "المنتج اللي تحتاجه متاح عندنا في مخزن الرحمة.",
      "اسألنا عن التوفر والتفاصيل على منتجات العناية والتجميل.",
      "مستلزمات التجميل والعناية الشخصية والعطور في مكان واحد.",
      "للطلب والاستفسار تواصل معنا على الهاتف أو واتساب.",
    ],
  },
  visual: {
    themeName: "luxury-editorial-outdoor",
    background: {
      style: "clean-white",
      baseColor: "#FFFFFF",
      mesh: {
        enabled: true,
        color: "#CBD5E1",
        opacity: 0.18,
      },
    },
    format: {
      width: 1080,
      height: 1920,
      orientation: "portrait",
    },
    primaryColors: {
      emerald: "#059669",
      darkEmerald: "#065f46",
      amber: "#F59E0B",
      slate: "#0F172A",
    },
    secondaryColors: {
      white: "#FFFFFF",
      offWhite: "#F8FAFC",
      lightGray: "#E2E8F0",
      alertRed: "#DC2626",
    },
    fonts: {
      primary: "'Cairo', 'Tajawal', sans-serif",
      secondary: "'Segoe UI', 'Roboto', sans-serif",
    },
    imageryStyle:
      "مشاهد خارجية/تحريرية فاخرة واقعية تُولَّد بالذكاء الاصطناعي (إضاءة ذهبية طبيعية، أسطح ملموسة، ظلال وانكسارات ضوء حقيقية) مع تركيب العبوة الأصلية نفسها كمرجع دون إعادة رسم الشعار أو النصوص أو الشكل.",
    layoutStyle:
      "تصميم عمودي 1080×1920 بأسلوب إعلاني فاخر: شعار عائم أعلى اليمين، عنوان عربي ثلاثي مزدوج الدرجة في الثلث العلوي المفتوح، وشريط تواصل سفلي بتدرج داكن فوق مشهد فوتوغرافي واقعي.",
  },
  contact: {
    phone: "01000017548",
    whatsappUrl: "https://wa.me/201000017548",
    deliveryPromise: "متاح توصيل للطلبات حسب التوفر",
    returnPolicy: "يُحدد حسب سياسة الاستبدال والاسترجاع من إدارة المخزن",
    label: "للتواصل :",
  },
  commercial: {
    currencyLabel: "ج.م",
    timezone: "Africa/Cairo",
    calendar: {
      countryCode: "EG",
      defaultLeadDays: 2,
      maxLeadDays: 30,
    },
    promoBadge: {
      backgroundColor: "#FFFFFF",
      accentColor: "#F59E0B",
      discountColor: "#DC2626",
      textColor: "#065f46",
    },
    occasionRibbon: {
      backgroundColor: "#FFFFFF",
      textColor: "#065f46",
    },
  },
  hashtags: [
    "#مخزن_الرحمة",
    "#عروض_الرحمة",
    "#مستحضرات_تجميل",
    "#العناية_بالشعر",
    "#العناية_بالبشرة",
    "#عناية_شخصية",
    "#عطور",
    "#مستلزمات_صيدليات",
  ],
};
