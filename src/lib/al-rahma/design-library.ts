/**
 * Design Intelligence & Visual Composition Library.
 *
 * A deterministic, reusable art-direction playbook for the PostCraft studio. It is
 * intentionally free of model calls, brand literals and tenant data: every
 * consumer imports the same rules so a two-image batch receives complementary
 * creative treatments instead of near-identical renders.
 *
 * Non-negotiables mirrored here:
 * - the authentic product is the hero and is never redrawn;
 * - text zones stay calm and legible;
 * - price/offer are operator-owned and absent unless explicitly supplied;
 * - lighting and context respect the product/industry and text direction;
 * - guarded visual-brief analysis may refine staging, never invent copy.
 */

import { createAdZones } from "./layout-geometry";
import type { ProductVisualCommercialBrief } from "./product-visual-brief";

export const DESIGN_RULE_IDS = [
  "product-hero-dominance",
  "clean-negative-space",
  "conditional-commercial-integrity",
  "lighting-context-harmony",
] as const;

export type DesignRuleId = (typeof DESIGN_RULE_IDS)[number];

export interface DesignRule {
  /** Visual Hierarchy & Balance Rule number (1-4). */
  order: 1 | 2 | 3 | 4;
  id: DesignRuleId;
  titleAr: string;
  titleEn: string;
  /** Short human-readable principle used by UI/tests. */
  principle: string;
  /** Compact directive appended to reference-conditioned image prompts. */
  promptDirective: string;
  /** Background-only form: no product may be painted into the plate. */
  backgroundPromptDirective: string;
  /** Directive used by the SVG overlay/copy layers. */
  layoutDirective: string;
}

export const DESIGN_RULES: Record<DesignRuleId, DesignRule> = {
  "product-hero-dominance": {
    order: 1,
    id: "product-hero-dominance",
    titleAr: "سيادة المنتج في الكادر",
    titleEn: "Product Hero Dominance",
    principle:
      "The authentic product is the unmistakable visual anchor: correct scale, clean framing and natural grounding with realistic shadows. Never obscure, crop, tilt or distort it.",
    promptDirective:
      "Keep the authentic product as the unmistakable hero: clean framing, correct scale, natural grounding and realistic directional shadows; never obscure, crop, tilt, duplicate or distort it.",
    backgroundPromptDirective:
      "Stage-first framing: keep the centre calm and unobstructed for a later authentic product; never paint, imply or substitute a product, bottle, jar, tube, box or packaging.",
    layoutDirective:
      "Reserve the central hero zone for the authentic packshot; typography and controls sit outside that zone.",
  },
  "clean-negative-space": {
    order: 2,
    id: "clean-negative-space",
    titleAr: "مساحة سلبية نظيفة وقراءة واضحة",
    titleEn: "Clean Negative Space & Readability",
    principle:
      "Keep calm, high-contrast breathing room for the short sales line, optional price and optional offer note. Nothing may crowd or overlap the product or the brand emblem.",
    promptDirective:
      "Reserve calm, high-contrast negative space for later typography; no visual noise, no generated letters, no numbers, no Arabic script, no garbled pseudo-script, no watermarks and no overlapping props in the upper or lower text zones.",
    backgroundPromptDirective:
      "Reserve calm, high-contrast negative space in the upper and lower zones for later typography; no visual noise, no generated letters, no numbers, no Arabic script, no garbled pseudo-script and no watermarks.",
    layoutDirective:
      "Place headline lines in the calm upper zone and optional commercial metadata in the bounded lower zone, clear of the product and emblem.",
  },
  "conditional-commercial-integrity": {
    order: 3,
    id: "conditional-commercial-integrity",
    titleAr: "سلامة السعر والعرض المشروط",
    titleEn: "Conditional Pricing & Offer Integrity",
    principle:
      "Render price only when the operator supplied it and offer text only when the operator supplied it. Never invent discounts, badges, prices, urgency or shipping promises.",
    promptDirective:
      "No generated price tags, discount badges, percentages, banners, slogans or promotional text of any kind; commercial text is added separately only when explicitly provided.",
    backgroundPromptDirective:
      "No generated price tags, discount badges, percentages, banners, slogans or promotional text of any kind; commercial text is added separately only when explicitly provided.",
    layoutDirective:
      "Omit the commercial badge entirely when both price and offer are absent; never fabricate a discount from an empty field.",
  },
  "lighting-context-harmony": {
    order: 4,
    id: "lighting-context-harmony",
    titleAr: "تناسق الإضاءة والسياق",
    titleEn: "Lighting, Shadow & Context Harmony",
    principle:
      "Match light direction, softness and mood to the product/industry context, respecting the non-beauty/industrial neutral guard and the locale's RTL/LTR text flow.",
    promptDirective:
      "Match light direction, softness and mood to the product context; use a neutral professional studio for industrial or unclassified products and keep the reserved text flow uncluttered.",
    backgroundPromptDirective:
      "Match light direction, softness and mood to the product context; use a neutral professional studio for industrial or unclassified products and keep the reserved text flow uncluttered.",
    layoutDirective:
      "Align text anchors and reading order to RTL or LTR without changing the product or the meaning of operator copy.",
  },
};

export const DESIGN_RULE_LIST: DesignRule[] = DESIGN_RULE_IDS.map(
  (id) => DESIGN_RULES[id],
);

export type CreativeSlot = 1 | 2;
export type CreativeSlotId = "hero-clean" | "contextual-angle";

export interface CreativeSlotRecipe {
  slot: CreativeSlot;
  id: CreativeSlotId;
  labelAr: string;
  labelEn: string;
  /** Prompt fragment that makes the two renders visibly different. */
  promptDirective: string;
  /** Background-only counterpart for text-to-image scene plates. */
  backgroundPromptDirective: string;
  composition: string;
  lighting: string;
  /** Claim-free Arabic hook template; {{brand}} is injected by the copywriter. */
  copyHookTemplate: string;
  overlayTreatment: string;
}

export const CREATIVE_SLOT_RECIPES: Record<CreativeSlot, CreativeSlotRecipe> = {
  1: {
    slot: 1,
    id: "hero-clean",
    labelAr: "بطل نظيف ومباشر",
    labelEn: "Crisp Hero Presentation",
    promptDirective:
      "SLOT hero-clean: crisp centred hero presentation, near-frontal three-quarter view, upright product at generous scale, uncluttered surface, even golden-hour key light with one soft directional shadow.",
    backgroundPromptDirective:
      "SLOT hero-clean background: clear centred stage with symmetric margins, even softly diffused key light and one clean grounding shadow area; minimal environmental busyness.",
    composition:
      "Centred, symmetrical hero placement with clear margins; the product reads first at thumbnail size.",
    lighting:
      "Even, softly diffused key light; one clean grounding shadow; minimal environmental busyness.",
    copyHookTemplate: "اختار المنتج المناسب ليك من {{brand}}.",
    overlayTreatment:
      "Direct short sales hook in line 1; sales line or verified benefit in line 2; compact commercial metadata below.",
  },
  2: {
    slot: 2,
    id: "contextual-angle",
    labelAr: "زاوية سياقية مكمّلة",
    labelEn: "Complementary Contextual Angle",
    promptDirective:
      "SLOT contextual-angle: same authentic product, subtle camera shift to a rule-of-thirds position, warmer cross-light, deeper layered shadow and richer contextual texture while the label remains razor sharp and fully legible.",
    backgroundPromptDirective:
      "SLOT contextual-angle background: asymmetric rule-of-thirds stage with a slightly lower camera feel, warmer cross-light, longer shadow and richer contextual texture while the centre stays open for the product.",
    composition:
      "Asymmetric rule-of-thirds staging with a slightly lower camera angle; product stays dominant but the environment adds depth.",
    lighting:
      "Warmer directional cross-light with a longer shadow and gentle rim highlight; distinct mood from slot 1.",
    copyHookTemplate: "نظرة تانية لمنتج مميز من {{brand}}.",
    overlayTreatment:
      "Verified benefit or product-focused angle in line 1; sales line in line 2; same user inputs, different emphasis.",
  },
};

export function creativeSlotRecipe(slot: CreativeSlot): CreativeSlotRecipe {
  return CREATIVE_SLOT_RECIPES[slot === 2 ? 2 : 1];
}

export type TextDirection = "rtl" | "ltr";

export function textDirectionDirective(direction: TextDirection): string {
  return direction === "ltr"
    ? "Reserve left-to-right reading flow for operator-supplied text; keep anchors and spacing LTR-safe."
    : "Reserve right-to-left reading flow for operator-supplied text; keep anchors and spacing RTL-safe.";
}

export interface DesignContext {
  brand?: string | null;
  industry?: string | null;
  category?: string | null;
  name?: string | null;
  benefits?: readonly string[] | null;
  /** Guarded deep visual brief from the vision stage; never trusted for claims. */
  visualBrief?: ProductVisualCommercialBrief | null;
}

export interface DesignPromptOptions {
  slot?: CreativeSlot;
  context?: DesignContext;
  textDirection?: TextDirection;
  /** Text-to-image plates must never be told to paint a product. */
  backgroundOnly?: boolean;
  /** Shorter form for safety retries where prompt length matters. */
  compact?: boolean;
  /** Explicit brief override for callers that do not carry a full context. */
  visualBrief?: ProductVisualCommercialBrief | null;
}

/** Context tone guard shared by scene, composite and background prompt builders. */
export function contextMoodDirective(context: DesignContext = {}): string {
  const brief = context.visualBrief ?? null;
  const industry = context.industry || brief?.industry || null;
  const haystack = [
    context.brand,
    industry,
    context.category || brief?.category,
    context.name || brief?.identity,
    brief?.lightingMood,
    ...(context.benefits ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const industrial =
    /(industrial|auto|automotive|engine|mechanic|tool|electronic|hardware|machinery|ميكانيك|سيارات|الكترونيات|صناعي|معدات)/.test(
      haystack,
    );
  const beautyIndustry = Boolean(industry) &&
    /(perfume|fragrance|beauty|cosmetic|skincare|haircare|skin|عطر|تجميل|عناية|بشرة|شعر)/i.test(
      industry ?? "",
    );
  if (industrial || (industry && !beautyIndustry)) {
    return "Neutral professional studio context: no beauty, cosmetic or spa styling.";
  }
  if (/(oud|oriental|amber|smoke|incense|perfume|fragrance|عطر|عود|برفان)/.test(haystack)) {
    return "Warm luxury fragrance context with amber/incense atmosphere.";
  }
  if (/(skin|cream|moistur|botanical|aloe|hair|shampoo|بشرة|كريم|مرطب|شعر|شامبو)/.test(haystack)) {
    return "Fresh botanical care context with soft natural daylight.";
  }
  return "Premium editorial retail context with restrained, product-first styling.";
}

const DEFAULT_BRIEF_PALETTE = ["#FFFFFF", "#1D4ED8", "#2563EB"];

/**
 * Adds observed product staging signals only. Identity/category/industry are
 * already covered by the context mood directive; commercial claims are never
 * forwarded to an image model.
 */
export function visualBriefDirective(
  brief: ProductVisualCommercialBrief | null | undefined,
): string {
  if (!brief) return "";
  const tones = (brief.dominantTones ?? []).filter(Boolean).slice(0, 4);
  const palette = (brief.palette ?? []).filter(
    (color) =>
      !DEFAULT_BRIEF_PALETTE.some(
        (fallback) => fallback.toLowerCase() === color.toLowerCase(),
      ),
  ).slice(0, 4);
  const finish = brief.surfaceFinish && brief.surfaceFinish !== "mixed"
    ? brief.surfaceFinish
    : "";
  const lighting = brief.lightingMood && brief.lightingMood !== "cool-studio"
    ? brief.lightingMood
    : "";
  if (!tones.length && !palette.length && !finish && !lighting) return "";

  const details = [
    tones.length ? `dominant tones ${tones.join(", ")}` : "",
    finish ? `surface finish ${finish}` : "",
    palette.length ? `harmonious palette ${palette.join(", ")}` : "",
    lighting ? `lighting mood ${lighting}` : "",
  ].filter(Boolean);
  return `PRODUCT VISUAL BRIEF: observed product staging only — ${details.join("; ")}. Use it to guide light and surface, never to generate text, prices, claims or a redrawn package.`;
}

/**
 * Builds the shared design-system fragment appended to every image prompt.
 * It never asks the model to render typography; all words are SVG overlay text.
 */
export function buildDesignPromptBlock(options: DesignPromptOptions = {}): string {
  const direction = textDirectionDirective(options.textDirection ?? "rtl");
  const recipe = options.slot ? creativeSlotRecipe(options.slot) : null;
  const slotDirective = options.backgroundOnly
    ? recipe?.backgroundPromptDirective ?? ""
    : recipe?.promptDirective ?? "";
  const rules = DESIGN_RULE_LIST.map((rule) =>
    options.backgroundOnly ? rule.backgroundPromptDirective : rule.promptDirective,
  );
  const ruleSet = options.compact
    ? [
        rules[0],
        rules[1],
        rules[2],
      ]
    : rules;
  const context = options.compact ? "" : contextMoodDirective(options.context);
  const brief = options.visualBrief ?? options.context?.visualBrief ?? null;
  const visualBrief = visualBriefDirective(brief);

  return [
    "DESIGN SYSTEM (binding rules):",
    ...ruleSet,
    context,
    visualBrief,
    direction,
    slotDirective,
  ]
    .filter(Boolean)
    .join(" ");
}

export interface DesignHeadlineInput {
  productName: string;
  headline: string;
  benefitLine: string;
  salesLine?: string | null;
  /** Only pass benefits already verified against a verified source. */
  verifiedBenefit?: string | null;
}

export interface DesignHeadlinePlan {
  line1: string;
  line2: string;
  line3: string;
}

function distinct(value: string, ...used: string[]): string {
  const trimmed = value.trim();
  return trimmed && !used.some((item) => item.trim() === trimmed) ? trimmed : "";
}

/**
 * Slot-specific headline hierarchy. Every value comes from operator input,
 * verified claims or deterministic copy — never from invented benefits.
 */
export function headlinePlanForSlot(
  slot: CreativeSlot,
  input: DesignHeadlineInput,
): DesignHeadlinePlan {
  const productName = input.productName.trim();
  const headline = input.headline.trim();
  const benefitLine = input.benefitLine.trim();
  const salesLine = (input.salesLine ?? "").trim();
  const verifiedBenefit = (input.verifiedBenefit ?? "").trim();

  if (slot === 1) {
    const line1 = headline || productName;
    const line2 =
      distinct(salesLine || benefitLine, line1) ||
      distinct(benefitLine || salesLine, line1);
    const line3 = distinct(verifiedBenefit, line1, line2);
    return { line1, line2, line3 };
  }

  const line1 = verifiedBenefit || benefitLine || productName;
  const line2 =
    distinct(salesLine || productName || headline || benefitLine, line1) ||
    distinct(benefitLine || headline || productName, line1);
  const line3 = distinct(benefitLine || verifiedBenefit || productName, line1, line2);
  return { line1, line2, line3 };
}

export const DESIGN_LAYOUT = {
  /** Stable lower-zone anchor for operator price/offer metadata. */
  commercialBadgeY: 1480,
  /** Upper text block starts here; slot treatments offset within this zone. */
  headlineTopY: 290,
  /** Bottom contact vignette begins here on the 1080x1920 canvas. */
  contactBarY: 1770,
} as const;

/** Keeps the commercial badge inside the collision-free lower geometry zone. */
export function commercialBadgeYForSize(width: number, height: number): number {
  const zones = createAdZones(width, height, { price: true, offer: true });
  return zones.priceZone?.y ?? DESIGN_LAYOUT.commercialBadgeY;
}

export interface CommercialBadgeAnchors {
  priceX: number;
  priceAnchor: "start" | "end";
  offerX: number;
  offerAnchor: "start" | "end";
}

/** RTL keeps price right-aligned; LTR mirrors it without changing the data. */
export function commercialBadgeAnchors(
  badgeWidth: number,
  direction: TextDirection,
): CommercialBadgeAnchors {
  if (direction === "ltr") {
    return {
      priceX: 28,
      priceAnchor: "start",
      offerX: badgeWidth - 28,
      offerAnchor: "end",
    };
  }
  return {
    priceX: badgeWidth - 28,
    priceAnchor: "end",
    offerX: 28,
    offerAnchor: "start",
  };
}

export const DESIGN_RULE_IDS_BY_SLOT: Record<CreativeSlot, DesignRuleId[]> = {
  1: [...DESIGN_RULE_IDS],
  2: [...DESIGN_RULE_IDS],
};
