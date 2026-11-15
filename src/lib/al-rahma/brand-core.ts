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
  hashtags: string[];
}

export const AL_RAHMA_BRAND_CONFIG: BrandConfig = {
  id: "al-rahma-warehouse",
  brandName: "مخزن الرحمة",
  brandNameEnglish: "Al Rahma Warehouse",
  legalName: "مخزن الرحمة للأدوية والمستلزمات الطبية ومستحضرات التجميل",
  activity:
    "مستحضرات التجميل والعناية بالشعر والبشرة والعناية الشخصية والعطور والمستلزمات الطبية",
  tagline: "منتجات العناية والجمال والمستلزمات الطبية لدى مخزن الرحمة",
  taglineEnglish: "Beauty, Personal Care, Fragrance and Pharmacy Supplies",
  taglineShort: "عناية وجمال ومستلزمات طبية",
  valueProposition:
    "نوفر مستحضرات التجميل والعناية الشخصية والعطور والمستلزمات الطبية، مع التواصل المباشر للاستفسار عن التوفر والعروض.",
  voice: {
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
  },
  visual: {
    themeName: "clean-white-silver-mesh",
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
      emerald: "#059669", // لون الرحمة والنماء
      darkEmerald: "#065f46", // للتباين والنصوص والظلال
      amber: "#F59E0B", // للشارات وعروض الخصم
      slate: "#0F172A", // للنصوص الرئيسية والخلفيات الداكنة
    },
    secondaryColors: {
      white: "#FFFFFF",
      offWhite: "#F8FAFC",
      lightGray: "#E2E8F0",
      alertRed: "#DC2626", // لخصومات الـ Flash Deals والشارات العاجلة
    },
    fonts: {
      primary: "'Cairo', 'Tajawal', sans-serif",
      secondary: "'Segoe UI', 'Roboto', sans-serif",
    },
    imageryStyle:
      "صور حية فائقة الوضوح للمنتج مع خلفية استوديو نظيفة أو بيئة استخدام واقعية، إضاءة واضحة بدون ظلال مشوهة، إبراز خامات المنتج وتفاصيله الحقيقية.",
    layoutStyle:
      "تصميم عصري منظم ومريح بصرياً على مقاس رأسي 1080×1920: خلفية بيضاء نظيفة مع شبكة فضية خفيفة، صورة المنتج في المنتصف، شارة خصم بارزة، شارة سعر واضحة، وشريط ثقة سفلي.",
  },
  contact: {
    phone: "01000017548",
    whatsappUrl: "https://wa.me/20100017548",
    deliveryPromise: "يتم تأكيد تفاصيل التوصيل عند التواصل",
    returnPolicy: "تُحدد سياسة الاستبدال والاسترجاع من إدارة المخزن",
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
    "#مستلزمات_طبية",
  ],
};
