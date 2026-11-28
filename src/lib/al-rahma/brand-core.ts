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

/** Multi-tenant brand profile stored in D1 brand_profiles table. */
export interface BrandProfile {
  id: string;
  name: string;
  industry: string;
  tagline: string;
  phone: string;
  whatsapp: string;
  logo_url: string | null;
  logo_tone: "light" | "dark" | "gold-emerald";
  font_family: "Cairo" | "Tajawal" | "IBM Plex Sans Arabic";
  product_context_notes: string;
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


/** Minimal tenant brand context injected by multi-tenant runtime. */
export interface TenantBrandContext {
  brandName?: string | null;
  industry?: string | null;
  logoUrl?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  tagline?: string | null;
  currency?: string | null;
  timezone?: string | null;
  hashtags?: string[] | null;
  palette?: Partial<BrandVisualTheme["primaryColors"]> | null;
}

export type TenantBrandSource = TenantBrandContext & {
  brand?: TenantBrandContext | null;
};

/**
 * Studio/operator identity for the PostCraft UI shell only.
 *
 * All brand names, phone numbers and contact links used by the landing page,
 * dashboard shell and export filenames must come from this object. Generated
 * creatives use the tenant-locked BrandConfig above, never this config.
 */
export const IDESIGN_STUDIO_CONFIG = {
  name: "iDesign",
  productName: "PostCraft",
  tagline: "by iDesign",
  websiteLabel: "idesign.social",
  websiteUrl: "https://idesign.social",
  faviconUrl: "https://idesign.social/favicon.svg",
  email: "info@idesign.social",
  emailUrl: "mailto:info@idesign.social",
  phoneLabel: "+201097362000",
  whatsappUrl: "https://wa.me/201097362000",
  exportSlug: "basic-ad-studio",
  colors: {
    white: "#FFFFFF",
    royalBlue: "#1D4ED8",
    royalBlueBright: "#2563EB",
  },
} as const;

export type IDesignStudioConfig = typeof IDESIGN_STUDIO_CONFIG;

export function buildBrandConfigFromTenant(ctx?: TenantBrandSource | null): BrandConfig {
  const base = AL_RAHMA_BRAND_CONFIG;
  if (!ctx) return base;
  const nested = "brand" in ctx ? ctx.brand : null;
  const source: TenantBrandContext =
    nested && typeof nested === "object" ? nested : ctx;
  const brandName = (source.brandName || "").trim();
  const locked = brandName.length > 0;
  const resolvedName = brandName || base.brandName;
  const industry = (source.industry || "").trim();
  const phone = (source.phone || "").trim() || (locked ? "" : base.contact.phone);
  const whatsapp =
    (source.whatsapp || "").trim() || (locked ? "" : base.contact.whatsappUrl);
  const tagline = (source.tagline || "").trim() || (locked ? industry : base.tagline);
  const currency = (source.currency || "").trim() || base.commercial.currencyLabel;
  const timezone = (source.timezone || "").trim() || base.commercial.timezone;
  const hashtags =
    Array.isArray(source.hashtags) && source.hashtags.length
      ? source.hashtags.filter(Boolean).slice(0, 15)
      : locked
        ? [`#${resolvedName.replace(/[^\p{L}\p{N}]+/gu, "_")}`]
        : base.hashtags;
  const palette = source.palette ?? {};
  return {
    ...base,
    id: locked ? "locked-tenant-brand" : base.id,
    brandName: resolvedName,
    brandNameEnglish: resolvedName,
    legalName: locked ? resolvedName : base.legalName,
    valueProposition: locked
      ? "للتواصل والاستفسار عن المنتجات."
      : base.valueProposition,
    voice: locked ? { ...base.voice, keyMessages: [] } : base.voice,
    activity: tagline,
    tagline,
    taglineEnglish: tagline,
    taglineShort: tagline,
    contact: {
      ...base.contact,
      phone,
      whatsappUrl: whatsapp,
      deliveryPromise: locked ? "" : base.contact.deliveryPromise,
      returnPolicy: locked ? "" : base.contact.returnPolicy,
      label: locked ? "" : "للتواصل :",
    },
    commercial: { ...base.commercial, currencyLabel: currency, timezone },
    hashtags,
    visual: {
      ...base.visual,
      primaryColors: { ...base.visual.primaryColors, ...palette },
    },
  };
}
