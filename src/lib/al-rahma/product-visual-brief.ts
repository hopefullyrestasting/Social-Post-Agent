import { isRawFilename } from "./strict-design-rules";

export type LightingMood = "warm" | "cool-studio" | "high-contrast" | "natural-daylight";
export type SurfaceFinish = "matte" | "glossy" | "metallic" | "glass" | "textile" | "mixed";

export interface ProductVisualCommercialBrief {
  identity: string; primaryFunction: string; category: string; industry: string;
  dominantTones: string[]; surfaceFinish: SurfaceFinish; palette: string[];
  lightingMood: LightingMood; shortSalesLine: string; language: "ar" | "en" | "ms" | "fr" | "de" | "zh";
}

const INDUSTRY_GUARDS: Record<string, string[]> = {
  automotive: ["beauty", "cosmetic", "spa", "skincare"],
  industrial: ["beauty", "cosmetic", "spa", "skincare"],
  beauty: ["engine", "automotive", "mechanical", "industrial"],
};

function clean(value: unknown, max = 160): string {
  if (typeof value !== "string") return "";
  const text = value.trim().replace(/\s+/g, " ").slice(0, max);
  return text && !isRawFilename(text) ? text : "";
}
function list(value: unknown, max = 5): string[] {
  return Array.isArray(value) ? value.map(item => clean(item, 40)).filter(Boolean).slice(0, max) : [];
}
function mood(value: unknown): LightingMood {
  return ["warm", "cool-studio", "high-contrast", "natural-daylight"].includes(String(value))
    ? value as LightingMood : "cool-studio";
}
function finish(value: unknown): SurfaceFinish {
  return ["matte", "glossy", "metallic", "glass", "textile", "mixed"].includes(String(value))
    ? value as SurfaceFinish : "mixed";
}
export function isIndustryCompatible(industry: string, category: string, identity: string): boolean {
  const text = `${category} ${identity}`.toLowerCase();
  return !(INDUSTRY_GUARDS[industry.toLowerCase()] ?? []).some(forbidden => text.includes(forbidden));
}
export function parseProductVisualBrief(raw: unknown, language: ProductVisualCommercialBrief["language"], fallback: Pick<ProductVisualCommercialBrief, "identity" | "category" | "industry">): ProductVisualCommercialBrief {
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const fallbackIdentity = clean(fallback.identity) || "منتج موثّق";
  const fallbackCategory = clean(fallback.category) || "general";
  const fallbackIndustry = clean(fallback.industry) || "general";
  const identity = clean(value.identity) || fallbackIdentity;
  const category = clean(value.category) || fallbackCategory;
  const industry = clean(value.industry) || fallbackIndustry;
  const compatible = isIndustryCompatible(industry, category, identity);
  return {
    identity, category: compatible ? category : fallbackCategory, industry,
    primaryFunction: clean(value.primaryFunction) || "Product benefit requires verification",
    dominantTones: list(value.dominantTones),
    surfaceFinish: finish(value.surfaceFinish),
    palette: list(value.palette).length ? list(value.palette) : ["#FFFFFF", "#1D4ED8", "#2563EB"],
    lightingMood: mood(value.lightingMood),
    shortSalesLine: clean(value.shortSalesLine, 110) || identity,
    language,
  };
}
export function visualBriefPrompt(language: ProductVisualCommercialBrief["language"], industry: string): string {
  return `Return JSON only. Analyze the product itself, never the background. Identify its function, category, dominant tones, surface finish, and a harmonious palette. Keep the industry context as ${industry}; do not substitute an unrelated setting. Write a truthful short sales line in ${language}; never invent a price, discount, or claim.`;
}

/** Safely reads an optional context brief without treating arrays/null as data. */
export function optionalProductVisualBrief(
  value: unknown,
  language: ProductVisualCommercialBrief["language"],
  fallback: Pick<ProductVisualCommercialBrief, "identity" | "category" | "industry">,
): ProductVisualCommercialBrief | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return parseProductVisualBrief(value, language, fallback);
}
