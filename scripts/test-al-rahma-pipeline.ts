import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import {
  AL_RAHMA_BRAND_CONFIG,
  ArabicCopywriter,
  OverlaySystem,
  ProductionEngine,
  QualityGate,
  calculatePromoPrice,
  evaluatePromotion,
  resolveActivePromotion,
  resolveBackground,
  resolveUpcomingOccasion,
  templateForVariant,
  cairoToday,
} from "../src/lib/al-rahma";

const brand = AL_RAHMA_BRAND_CONFIG;

const unverifiedProduct = {
  title: "منتج عناية",
  category: "hair_care",
  features: [] as string[],
};

const verifiedProduct = {
  title: "شامبو العناية الموّثق",
  category: "العناية بالشعر",
  features: ["تركيبة للعناية اليومية"],
  sourceUrl: "https://example.test/official-source",
  verificationStatus: "verified",
  verifiedBenefits: ["ترطيب عميق يدوم طويلاً للشعر", "نعومة ملحوظة من أول استخدام"],
  verifiedUsage: ["يوضع على شعر مبلل ويُشطف"],
  productImageUrl: "https://example.test/packshot.png",
  warehouseStockStatus: "in_stock" as const,
};

// --- BrandConfig contract ----------------------------------------------------

assert.match(brand.contact.phone, /^\d{11}$/);
assert.equal(brand.contact.label, "للتواصل :");
assert.ok(brand.contact.whatsappUrl.endsWith(`20${brand.contact.phone.slice(1)}`));
assert.match(brand.contact.whatsappUrl, /^https:\/\/wa\.me\/\d+$/);
assert.equal(
  brand.contact.whatsappUrl,
  `https://wa.me/20${brand.contact.phone.replace(/^0/, "")}`,
  "WhatsApp URL must encode the configured phone in international form.",
);
assert.ok(brand.activity.includes("متاح توصيل"), "Activity/subtitle must include متاح توصيل.");
assert.equal(brand.visual.format.width, 1080);
assert.equal(brand.visual.format.height, 1920);
assert.equal(brand.visual.format.orientation, "portrait");
assert.equal(brand.visual.background.style, "clean-white");
assert.equal(brand.visual.background.baseColor, "#FFFFFF");
assert.equal(brand.visual.themeName, "pro-designer-studio");
assert.equal(brand.commercial.currencyLabel, "ج.م");
assert.equal(brand.commercial.timezone, "Africa/Cairo");
assert.deepEqual(JSON.parse(JSON.stringify(brand)), brand, "BrandConfig must stay plain JSON-serializable data.");

// --- Copywriting ------------------------------------------------------------

const copy = ArabicCopywriter.generatePost(unverifiedProduct, "product_information", { variant: 1 });
assert.equal("priceTag" in copy, false, "Pricing fields must be gone.");
assert.ok(copy.fullPostText.includes(unverifiedProduct.title));
assert.ok(copy.fullPostText.includes(brand.contact.phone));
assert.ok(copy.cta.includes(brand.contact.phone));
assert.ok(copy.ctaShort.trim().length > 0);

function assertWordRange(text: string, min: number, max: number, label: string) {
  const count = text.trim().split(/\s+/).filter(Boolean).length;
  assert.ok(count >= min && count <= max, `${label} must be ${min}-${max} words, got ${count}: "${text}"`);
}

assertWordRange(copy.benefitLine, 4, 8, "Sales copy (variant 1)");
assert.equal(/خصم|تخفيض|السعر|ج\.م|EGP/.test(copy.fullPostText), false);

const copyAgain = ArabicCopywriter.generatePost(unverifiedProduct, "product_information", { variant: 1 });
assert.deepEqual(copyAgain, copy, "Copy must be deterministic so creatives are reproducible.");

const copyV2 = ArabicCopywriter.generatePost(unverifiedProduct, "product_information", { variant: 2 });
assertWordRange(copyV2.benefitLine, 4, 8, "Sales copy (variant 2)");

const verifiedCopy1 = ArabicCopywriter.generatePost(verifiedProduct, "product_information", { variant: 1 });
const verifiedCopy2 = ArabicCopywriter.generatePost(verifiedProduct, "beauty_routine", { variant: 2 });
assertWordRange(verifiedCopy1.benefitLine, 4, 8, "Verified sales copy (variant 1)");
assertWordRange(verifiedCopy2.benefitLine, 4, 8, "Verified sales copy (variant 2)");
for (const usage of verifiedProduct.verifiedUsage) {
  assert.equal(
    verifiedCopy1.benefitLine.includes(usage),
    false,
    "Variant 1 sales copy must never include usage instructions.",
  );
  assert.equal(
    verifiedCopy2.benefitLine.includes(usage),
    false,
    "Variant 2 sales copy must never include usage instructions.",
  );
}

const greetedCopy = ArabicCopywriter.generatePost(verifiedProduct, "product_information", {
  variant: 1,
  occasionGreeting: "كل عام وأنتم بخير بمناسبة عيد الأم",
});
assert.ok(
  greetedCopy.fullPostText.includes("كل عام وأنتم بخير بمناسبة عيد الأم"),
  "Occasion greeting must be injected into the post body.",
);

// --- Quality gate -----------------------------------------------------------

const quality = QualityGate.evaluate(copy, unverifiedProduct, { width: 1080, height: 1920 });
assert.equal(quality.passed, false);
assert.ok(quality.errors.some((error) => error.includes("مصدر")));
assert.ok(quality.errors.some((error) => error.includes("packshot") || error.includes("صورة")));

const verifiedQuality = QualityGate.evaluate(verifiedCopy1, verifiedProduct, { width: 1080, height: 1920 });
assert.equal(verifiedQuality.passed, true, verifiedQuality.errors.join(" | ") || "verified creative must pass");
assert.ok(
  verifiedQuality.checks.some((c) => c.checkName === "Sales Copy Length" && c.passed),
  "Sales copy length check must pass for 4-8 words.",
);

const badLengthCopy = { ...verifiedCopy1, benefitLine: "كلمة" };
const badLengthQuality = QualityGate.evaluate(badLengthCopy, verifiedProduct, { width: 1080, height: 1920 });
assert.equal(badLengthQuality.passed, false);
assert.ok(
  badLengthQuality.checks.some((c) => c.checkName === "Sales Copy Length" && !c.passed),
  "Sales copy outside 4-8 words must fail.",
);

const pricingCopy = {
  ...verifiedCopy1,
  headline: "خصم 50% على المنتج",
  fullPostText: `خصم 50% ${verifiedCopy1.fullPostText}`,
};
const pricingQuality = QualityGate.evaluate(pricingCopy, verifiedProduct, { width: 1080, height: 1920 });
assert.equal(pricingQuality.passed, false);
assert.equal(
  pricingQuality.checks.find((check) => check.checkName === "No Price Or Discount Claims")?.passed,
  false,
  "Pricing or discount language must fail the gate.",
);

// --- Commercial: active vs expired promotions & 48h calendar ----------------

const fixedToday = "2027-03-20";
const activePromo = {
  id: "promo-active",
  product_id: "prod-1",
  original_price: 200,
  discount_percent: 25,
  promo_price: calculatePromoPrice(200, 25),
  starts_at: "2027-03-18",
  ends_at: "2027-03-22",
  is_active: 1,
};
const activeEvaluation = evaluatePromotion(activePromo, fixedToday);
assert.equal(activeEvaluation.status, "active");
if (activeEvaluation.status === "active") {
  assert.equal(activeEvaluation.promotion.promoPrice, 150);
  assert.equal(activeEvaluation.promotion.savings, 50);
}

const expiredPromo = { ...activePromo, id: "promo-expired", starts_at: "2027-03-01", ends_at: "2027-03-10" };
assert.equal(evaluatePromotion(expiredPromo, fixedToday).status, "expired");
assert.equal(resolveActivePromotion(expiredPromo, fixedToday), null);

const scheduledPromo = { ...activePromo, id: "promo-scheduled", starts_at: "2027-03-25", ends_at: "2027-03-30" };
assert.equal(evaluatePromotion(scheduledPromo, fixedToday).status, "scheduled");

const invalidPromo = { ...activePromo, id: "promo-invalid", promo_price: 10 };
assert.equal(evaluatePromotion(invalidPromo, fixedToday).status, "invalid");

const occasions = [
  {
    id: "cc-eg-eid-al-fitr",
    country_code: "EG",
    occasion_name_arabic: "عيد الفطر المبارك",
    greeting_text_arabic: "كل عام وأنتم بخير بمناسبة عيد الفطر المبارك",
    occasion_date: "2027-03-20",
    lead_days: 2,
    accent_theme: "amber",
    is_active: 1,
  },
];
const upcoming = resolveUpcomingOccasion(occasions, fixedToday);
assert.ok(upcoming, "Occasion must be returned on its day.");
assert.ok(upcoming.greeting.includes("عيد الفطر المبارك"));
assert.ok(resolveUpcomingOccasion(occasions, "2027-03-18"), "Occasion must be returned 2 days before (within lead).");
assert.equal(resolveUpcomingOccasion(occasions, "2027-03-17"), null, "Occasion must not trigger outside lead_days.");
assert.match(cairoToday(new Date("2027-03-20T12:00:00Z")), /^\d{4}-\d{2}-\d{2}$/);

// --- Template mapping -------------------------------------------------------

assert.equal(templateForVariant(1, "seed"), "silver-podium-botanical");
const v2a = templateForVariant(2, "seed-a");
const v2b = templateForVariant(2, "seed-b");
assert.ok(
  v2a === "botanical-arch-frame" || v2a === "editorial-beauty-card",
  "Variant 2 must alternate between botanical-arch-frame and editorial-beauty-card.",
);
assert.ok(
  v2b === "botanical-arch-frame" || v2b === "editorial-beauty-card",
  "Variant 2 must alternate between botanical-arch-frame and editorial-beauty-card.",
);
assert.equal(templateForVariant(2, "same-seed"), templateForVariant(2, "same-seed"), "Variant 2 template must be deterministic.");

// --- Production pipeline: two distinct variants -----------------------------

const variants = ProductionEngine.executeVariants({ product: verifiedProduct, today: fixedToday });
assert.equal(variants.length, 2);
assert.deepEqual(
  variants.map((r) => r.template),
  ["silver-podium-botanical", templateForVariant(2, verifiedProduct.title)],
);
assert.deepEqual(variants.map((r) => r.variantNumber), [1, 2]);
assert.equal(variants[0].variant, "silver-podium-botanical");
assert.ok(
  variants[1].template === "botanical-arch-frame" || variants[1].template === "editorial-beauty-card",
  "Variant 2 must use alternating template.",
);
assert.equal(variants[0].angle, "product_information");
assert.equal(variants[1].angle, "beauty_routine");
assertWordRange(variants[0].copy.benefitLine, 4, 8, "Engine variant 1 benefit line");
assertWordRange(variants[1].copy.benefitLine, 4, 8, "Engine variant 2 benefit line");
assert.notEqual(variants[0].svgOverlay, variants[1].svgOverlay, "Variants must differ in layout.");

for (const result of variants) {
  assert.equal(result.success, true, result.blockers.join(" | ") || result.qualityReport.errors.join(" | "));
  assert.equal(result.styleId, `al-rahma/${result.template}`);
  assert.equal(result.background.provider, "deterministic-studio");
  assert.deepEqual(result.metadata.dimensions, { width: 1080, height: 1920 });
  assert.ok(result.svgOverlay.includes(verifiedProduct.productImageUrl));
  assert.ok(result.svgOverlay.includes(brand.contact.phone), "Exact phone number must render.");
  assert.ok(result.svgOverlay.includes("\u200Fللتواصل:"), "Contact label must render with proper RTL formatting.");
  assert.equal(result.svgOverlay.includes("..."), false, "No truncation ellipsis allowed in rendered SVG.");
  assert.equal(result.svgOverlay.includes("…"), false, "No unicode ellipsis allowed in rendered SVG.");
  assert.ok(result.svgOverlay.includes("متاح توصيل"), "Header/subtitle must include متاح توصيل.");
  assert.ok(result.svgOverlay.includes("#FFFFFF"));
  assert.ok(result.svgOverlay.includes('data-template="'), "Template marker must be present.");
  assert.ok(result.svgOverlay.includes('data-packshot="true"'), "Packshot must be marked for cutout compositing.");
  assert.ok(result.svgOverlay.includes('height="670"'), "Hero packshot must be rendered at 670px height.");
  assert.ok(result.svgOverlay.includes('y="685"'), "Hero packshot must be grounded at bottom y=1355 (y=685 for 670px height).");
  assert.ok(result.svgOverlay.includes("#25D366") || result.svgOverlay.includes("25D366"), "Contact block must include WhatsApp icon.");
  assert.ok(result.svgOverlay.includes("#065F46") || result.svgOverlay.includes("065F46"), "Contact/footer must include bold emerald styling.");
  assert.equal(result.qualityReport.passed, true);
  assert.equal(result.metadata.promotion, null);
  assert.equal(result.metadata.occasion, null);
  assert.equal(result.svgOverlay.includes("promo-badge"), false, "No promo without an active in-window record.");
  assert.equal(result.svgOverlay.includes("occasion-ribbon"), false, "No greeting without an in-window occasion.");
}

assert.ok(variants[0].svgOverlay.includes("studio-podium") || variants[0].svgOverlay.includes("shader-podium") || variants[0].svgOverlay.includes("podium"), "Variant 1 must include a studio podium stage.");

const single = ProductionEngine.execute({ product: verifiedProduct, today: fixedToday });
assert.equal(single.variant, "silver-podium-botanical");
assert.equal(single.template, "silver-podium-botanical");
assert.equal(single.variantNumber, 1);
assert.equal(single.success, true);

// Active promo renders a controlled badge and passes the gate.
const promoVariants = ProductionEngine.executeVariants({ product: verifiedProduct, promotion: activePromo, today: fixedToday });
for (const result of promoVariants) {
  assert.equal(result.success, true, result.blockers.join(" | "));
  assert.ok(result.svgOverlay.includes("promo-badge"));
  assert.ok(result.svgOverlay.includes("150"));
  assert.ok(result.svgOverlay.includes("200"));
  assert.ok(result.svgOverlay.includes("خصم 25%"));
  assert.equal(result.qualityReport.passed, true);
  assert.ok(result.metadata.promotion);
  assert.equal(result.metadata.promotion?.promoPrice, 150);
  assert.ok(result.qualityReport.checks.some((c) => c.checkName === "Controlled Promotion Pricing" && c.passed));
}

// Expired promo: auto-revert to non-priced mode.
const expiredVariants = ProductionEngine.executeVariants({ product: verifiedProduct, promotion: expiredPromo, today: fixedToday });
for (const result of expiredVariants) {
  assert.equal(result.success, true, result.blockers.join(" | "));
  assert.equal(result.svgOverlay.includes("promo-badge"), false);
  assert.equal(result.metadata.promotion, null);
}

// Invalid promo: hard-blocks so hallucinated numbers never render.
const invalidVariants = ProductionEngine.executeVariants({ product: verifiedProduct, promotion: invalidPromo, today: fixedToday });
for (const result of invalidVariants) {
  assert.equal(result.success, false);
  assert.ok(result.blockers.length > 0);
  assert.equal(result.svgOverlay.includes("promo-badge"), false);
}

// 48h occasion greeting ribbon in-window.
const occasionInput = {
  id: "cc-eg-eid-al-fitr",
  occasionName: "عيد الفطر المبارك",
  greeting: "كل عام وأنتم بخير بمناسبة عيد الفطر المبارك",
  occasionDate: "2027-03-20",
  daysUntil: 0,
  accentTheme: "amber",
};
const occasionVariants = ProductionEngine.executeVariants({ product: verifiedProduct, occasion: occasionInput, today: fixedToday });
for (const result of occasionVariants) {
  assert.equal(result.success, true, result.blockers.join(" | "));
  assert.ok(result.svgOverlay.includes("occasion-ribbon"));
  assert.ok(result.svgOverlay.includes("عيد الفطر المبارك"));
  assert.ok(result.copy.fullPostText.includes("كل عام وأنتم بخير"));
  assert.ok(result.metadata.occasion);
}

// Missing authentic packshot blocks production instead of inventing an image.
const blocked = ProductionEngine.executeVariants({ product: { ...verifiedProduct, productImageUrl: null }, today: fixedToday });
assert.equal(blocked.every((result) => !result.success), true);
assert.equal(blocked[0].success, false);
assert.ok(blocked[0].blockers.some((blocker) => blocker.includes("packshot")));
assert.equal(blocked[1].success, false);

// --- Background providers ---------------------------------------------------

const fallback = resolveBackground({ width: 1080, height: 1920, template: "silver-podium-botanical" });
assert.equal(fallback.provider, "deterministic-studio");
assert.equal(fallback.kind, "scene");
assert.equal(fallback.template, "silver-podium-botanical");

const aiScene = resolveBackground({
  width: 1080,
  height: 1920,
  template: "botanical-arch-frame",
  sceneImageUrl: "https://image.pollinations.ai/prompt/test",
});
assert.equal(aiScene.provider, "pollinations");
assert.equal(aiScene.kind, "image");

const workersScene = resolveBackground({
  width: 1080,
  height: 1920,
  template: "editorial-beauty-card",
  sceneImageUrl: "data:image/png;base64,abc",
});
assert.equal(workersScene.provider, "cloudflare-ai");
assert.equal(workersScene.kind, "image");

// --- Overlay ----------------------------------------------------------------

const overlay = OverlaySystem.generateOverlaySvg({
  width: 1080,
  height: 1920,
  template: "silver-podium-botanical",
  showLogo: true,
  productImageUrl: verifiedProduct.productImageUrl,
  headline: verifiedProduct.title,
  benefitLine: "ترطيب عميق يدوم طويلاً للشعر",
  ctaText: "اطلب عبر واتساب",
  availabilityText: "متوفر في المخزن",
});
assert.ok(overlay.includes(brand.brandName));
assert.ok(overlay.includes(brand.contact.phone));
assert.ok(overlay.includes("\u200Fللتواصل:"));
assert.ok(overlay.includes("متاح توصيل"));
assert.ok(overlay.includes("ترطيب") && overlay.includes("عميق"), "Benefit line text must render in overlay.");
assert.ok(overlay.includes('data-packshot="true"'));
assert.ok(overlay.includes('height="670"'));
assert.ok(overlay.includes('y="685"'));
assert.equal(overlay.includes("..."), false);

const defaultOverlay = OverlaySystem.generateOverlaySvg({ width: 1080, height: 1920 });
assert.ok(defaultOverlay.includes(brand.contact.phone));
assert.ok(defaultOverlay.includes("\u200Fللتواصل:"));

// --- Single-source guard ----------------------------------------------------

const repoRoot = process.cwd();
const scannedDirs = ["src", "functions", "scripts"];
const configPath = "src/lib/al-rahma/brand-core.ts";
const needles = [
  brand.contact.phone,
  brand.contact.whatsappUrl.replace(/^https?:\/\//, ""),
  brand.brandName,
];

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return /\.(ts|tsx)$/.test(entry.name) ? [fullPath] : [];
  });
}

const normalized = (file: string) => relative(repoRoot, file).split("\\").join("/");
const offenders = scannedDirs
  .flatMap((directory) => walk(join(repoRoot, directory)))
  .filter((file) => normalized(file) !== configPath)
  .filter((file) => {
    const contents = readFileSync(file, "utf8");
    return needles.some((needle) => contents.includes(needle));
  });

assert.deepEqual(
  offenders,
  [],
  `Brand identity/contact values must live only in ${configPath}: ${offenders.join(", ")}`,
);

console.log(
  "Al Rahma pipeline tests passed: BrandConfig, 4-8 benefit-only copy (no usage, no ellipsis), 3 designer templates, RTL contact/footer, hero packshot grounding, quality gate, promos, 48h cultural greeting, and single-source brand identity.",
);
