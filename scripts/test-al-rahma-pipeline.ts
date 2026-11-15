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
  cairoToday,
} from "../src/lib/al-rahma";

const brand = AL_RAHMA_BRAND_CONFIG;

const unverifiedProduct = {
  title: "منتج عناية",
  category: "hair_care",
  features: [] as string[],
};

const verifiedProduct = {
  title: "منتج عناية موثّق",
  category: "العناية بالشعر",
  features: ["تركيبة للعناية اليومية"],
  sourceUrl: "https://example.test/official-source",
  verificationStatus: "verified",
  verifiedBenefits: ["فائدة موثّقة أولى", "فائدة موثّقة ثانية"],
  verifiedUsage: ["طريقة استخدام موثّقة"],
  productImageUrl: "https://example.test/packshot.png",
  warehouseStockStatus: "in_stock" as const,
};

// --- BrandConfig contract ----------------------------------------------------

assert.match(brand.contact.phone, /^\d{11}$/);
assert.match(brand.contact.whatsappUrl, /^https:\/\/wa\.me\/\d+$/);
assert.equal(
  brand.contact.whatsappUrl,
  `https://wa.me/20${brand.contact.phone.replace(/^0/, "")}`,
  "WhatsApp URL must encode the configured phone in international form.",
);
assert.match(brand.activity, /مستحضرات التجميل/);
assert.equal(brand.visual.format.width, 1080);
assert.equal(brand.visual.format.height, 1920);
assert.equal(brand.visual.format.orientation, "portrait");
assert.equal(brand.visual.background.style, "clean-white");
assert.equal(brand.visual.background.baseColor, "#FFFFFF");
assert.equal(brand.visual.background.mesh.enabled, true);
assert.equal(brand.commercial.currencyLabel, "ج.م");
assert.equal(brand.commercial.timezone, "Africa/Cairo");
assert.equal(brand.commercial.calendar.defaultLeadDays, 2);
assert.deepEqual(
  JSON.parse(JSON.stringify(brand)),
  brand,
  "BrandConfig must stay plain JSON-serializable data.",
);

// --- Copywriting ------------------------------------------------------------

const copy = ArabicCopywriter.generatePost(
  unverifiedProduct,
  "product_information",
);
assert.equal("priceTag" in copy, false, "Pricing fields must be gone.");
assert.equal("savingsText" in copy, false, "Pricing fields must be gone.");
assert.ok(copy.fullPostText.includes(unverifiedProduct.title));
assert.ok(copy.fullPostText.includes(brand.contact.phone));
assert.ok(copy.cta.includes(brand.contact.phone));
assert.ok(copy.ctaShort.trim().length > 0);
assert.equal(
  /[0-9٠-٩]/.test(copy.ctaShort),
  false,
  "The short CTA must stay pure Arabic; the footer carries the phone.",
);
assert.equal(copy.benefitLine, "", "No verified claims means no benefit line.");
assert.equal(/خصم|السعر|جنيه|ج\.م/.test(copy.fullPostText), false);

const copyAgain = ArabicCopywriter.generatePost(
  unverifiedProduct,
  "product_information",
);
assert.deepEqual(
  copyAgain,
  copy,
  "Copy must be deterministic so creatives are reproducible.",
);

const studioCopy = ArabicCopywriter.generatePost(
  verifiedProduct,
  "beauty_routine",
  { variant: "studio-angle", ctaIndex: 1 },
);
assert.equal(studioCopy.benefitLine, verifiedProduct.verifiedBenefits[1]);
assert.notEqual(studioCopy.cta, copy.cta);

const greetedCopy = ArabicCopywriter.generatePost(
  verifiedProduct,
  "product_information",
  { occasionGreeting: "كل عام وأنتم بخير بمناسبة عيد الأم" },
);
assert.ok(
  greetedCopy.fullPostText.includes("كل عام وأنتم بخير بمناسبة عيد الأم"),
  "Occasion greeting must be injected into the post body.",
);

// --- Quality gate -----------------------------------------------------------

const quality = QualityGate.evaluate(copy, unverifiedProduct, {
  width: 1080,
  height: 1920,
});
assert.equal(quality.passed, false);
assert.ok(quality.errors.some((error) => error.includes("مصدر")));
assert.ok(quality.errors.some((error) => error.includes("صورة")));

const verifiedQuality = QualityGate.evaluate(studioCopy, verifiedProduct, {
  width: 1080,
  height: 1920,
});
assert.equal(
  verifiedQuality.passed,
  true,
  verifiedQuality.errors.join(" | ") || "verified creative must pass",
);

const pricingCopy = {
  ...copy,
  headline: "خصم 50% على المنتج",
  fullPostText: `خصم 50% ${copy.fullPostText}`,
};
const pricingQuality = QualityGate.evaluate(pricingCopy, verifiedProduct, {
  width: 1080,
  height: 1920,
});
assert.equal(pricingQuality.passed, false);
assert.equal(
  pricingQuality.checks.find(
    (check) => check.checkName === "No Price Or Discount Claims",
  )?.passed,
  false,
  "Pricing or discount language must fail the gate.",
);

// --- Commercial: active vs expired promotions & 48h calendar ----------------

const fixedToday = "2027-03-20"; // within seeded Eid Al-Fitr lead window (2027-03-18..20)
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

const expiredPromo = {
  ...activePromo,
  id: "promo-expired",
  starts_at: "2027-03-01",
  ends_at: "2027-03-10",
};
assert.equal(evaluatePromotion(expiredPromo, fixedToday).status, "expired");
assert.equal(resolveActivePromotion(expiredPromo, fixedToday), null);

const scheduledPromo = {
  ...activePromo,
  id: "promo-scheduled",
  starts_at: "2027-03-25",
  ends_at: "2027-03-30",
};
assert.equal(evaluatePromotion(scheduledPromo, fixedToday).status, "scheduled");

const invalidPromo = {
  ...activePromo,
  id: "promo-invalid",
  promo_price: 10, // inconsistent with 200 @ 25%
};
assert.equal(evaluatePromotion(invalidPromo, fixedToday).status, "invalid");

// 48h (lead_days=2) cultural calendar: 2 days before is included, 3 days is not.
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
assert.equal(upcoming.occasionName, "عيد الفطر المبارك");
assert.ok(upcoming.greeting.includes("عيد الفطر المبارك"));

const twoDaysBefore = resolveUpcomingOccasion(occasions, "2027-03-18");
assert.ok(twoDaysBefore, "Occasion must be returned 2 days before (within lead).");

const threeDaysBefore = resolveUpcomingOccasion(occasions, "2027-03-17");
assert.equal(threeDaysBefore, null, "Occasion must not trigger outside lead_days.");

assert.match(cairoToday(new Date("2027-03-20T12:00:00Z")), /^\d{4}-\d{2}-\d{2}$/);

// --- Production pipeline: two distinct variants -----------------------------

const variants = ProductionEngine.executeVariants({
  product: verifiedProduct,
  today: fixedToday,
});
assert.equal(variants.length, 2);
assert.deepEqual(
  variants.map((result) => result.variant),
  ["hero-clean", "studio-angle"],
);
assert.deepEqual(
  variants.map((result) => result.variantNumber),
  [1, 2],
);
assert.equal(variants[0].angle, "product_information");
assert.equal(variants[1].angle, "beauty_routine");
assert.equal(variants[0].copy.benefitLine, verifiedProduct.verifiedBenefits[0]);
assert.equal(variants[1].copy.benefitLine, verifiedProduct.verifiedBenefits[1]);
assert.notEqual(variants[0].copy.cta, variants[1].copy.cta);
assert.notEqual(
  variants[0].svgOverlay,
  variants[1].svgOverlay,
  "Variants must differ in layout, not just color.",
);

for (const result of variants) {
  assert.equal(result.success, true, result.blockers.join(" | "));
  assert.equal(result.styleId, "al-rahma/clean-white-silver-mesh");
  assert.equal(result.background.provider, "deterministic-studio");
  assert.deepEqual(result.metadata.dimensions, { width: 1080, height: 1920 });
  assert.ok(result.svgOverlay.includes(verifiedProduct.productImageUrl));
  assert.ok(result.svgOverlay.includes(brand.contact.phone));
  assert.ok(result.svgOverlay.includes("#FFFFFF"));
  assert.ok(result.svgOverlay.includes("silver-mesh"));
  assert.ok(result.svgOverlay.includes("packshot-shadow"));
  assert.ok(result.svgOverlay.includes("studio-rim-glow"));
  assert.ok(result.svgOverlay.includes("contact-shadow"));
  assert.equal(result.qualityReport.passed, true);
  assert.equal(result.metadata.promotion, null);
  assert.equal(result.metadata.occasion, null);
  assert.equal(
    result.svgOverlay.includes("promo-badge"),
    false,
    "No promo without an active in-window record.",
  );
  assert.equal(
    result.svgOverlay.includes("occasion-ribbon"),
    false,
    "No greeting without an in-window occasion.",
  );
}

assert.ok(variants[0].svgOverlay.includes("studio-glow"));
assert.ok(variants[1].svgOverlay.includes("studio-accents"));
assert.ok(variants[1].svgOverlay.includes("multi-bottle-depth"));

const single = ProductionEngine.execute({ product: verifiedProduct, today: fixedToday });
assert.equal(single.variant, "hero-clean");
assert.equal(single.success, true);

// Active promo renders a controlled badge and passes the gate.
const promoVariants = ProductionEngine.executeVariants({
  product: verifiedProduct,
  promotion: activePromo,
  today: fixedToday,
});
for (const result of promoVariants) {
  assert.equal(result.success, true, result.blockers.join(" | "));
  assert.ok(result.svgOverlay.includes("promo-badge"));
  assert.ok(result.svgOverlay.includes("150"));
  assert.ok(result.svgOverlay.includes("200"));
  assert.ok(result.svgOverlay.includes("خصم 25%"));
  assert.equal(result.qualityReport.passed, true);
  assert.ok(result.metadata.promotion);
  assert.equal(result.metadata.promotion?.promoPrice, 150);
  assert.ok(
    result.qualityReport.checks.some(
      (c) => c.checkName === "Controlled Promotion Pricing" && c.passed,
    ),
  );
}

// Expired promo: auto-revert to non-priced mode.
const expiredVariants = ProductionEngine.executeVariants({
  product: verifiedProduct,
  promotion: expiredPromo,
  today: fixedToday,
});
for (const result of expiredVariants) {
  assert.equal(result.success, true, result.blockers.join(" | "));
  assert.equal(result.svgOverlay.includes("promo-badge"), false);
  assert.equal(result.metadata.promotion, null);
}

// Invalid promo: hard-blocks so hallucinated numbers never render.
const invalidVariants = ProductionEngine.executeVariants({
  product: verifiedProduct,
  promotion: invalidPromo,
  today: fixedToday,
});
for (const result of invalidVariants) {
  assert.equal(result.success, false);
  assert.ok(result.blockers.some((b) => b.includes("السعر")));
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
const occasionVariants = ProductionEngine.executeVariants({
  product: verifiedProduct,
  occasion: occasionInput,
  today: fixedToday,
});
for (const result of occasionVariants) {
  assert.equal(result.success, true, result.blockers.join(" | "));
  assert.ok(result.svgOverlay.includes("occasion-ribbon"));
  assert.ok(result.svgOverlay.includes("عيد الفطر المبارك"));
  assert.ok(result.copy.fullPostText.includes("كل عام وأنتم بخير"));
  assert.ok(result.metadata.occasion);
}

// Missing authentic packshot blocks production instead of inventing an image.
const blocked = ProductionEngine.executeVariants({
  product: { ...verifiedProduct, productImageUrl: null },
  today: fixedToday,
});
assert.equal(blocked.every((result) => !result.success), true);
assert.equal(blocked[0].success, false);
assert.ok(blocked[0].blockers.some((blocker) => blocker.includes("packshot")));
assert.equal(blocked[1].success, false);

// --- Background providers ---------------------------------------------------

const fallback = resolveBackground("muapi", {
  width: 1080,
  height: 1920,
  variant: "hero-clean",
});
assert.equal(fallback.requestedProvider, "muapi");
if (fallback.provider === "deterministic-studio") {
  assert.ok(fallback.fallbackReason, "Fallback must explain why it was used.");
  assert.equal(fallback.kind, "mesh");
}

const defaultBackground = resolveBackground(undefined, {
  width: 1080,
  height: 1920,
  variant: "studio-angle",
});
assert.equal(defaultBackground.provider, "deterministic-studio");
assert.equal(defaultBackground.kind, "mesh");

// --- Overlay ----------------------------------------------------------------

const overlay = OverlaySystem.generateOverlaySvg({
  width: 1080,
  height: 1920,
  variant: "hero-clean",
  showLogo: true,
  productImageUrl: verifiedProduct.productImageUrl,
  headline: verifiedProduct.title,
  benefitLine: verifiedProduct.verifiedBenefits[0],
  ctaText: studioCopy.ctaShort,
  availabilityText: "متوفر في المخزن",
});
assert.ok(overlay.includes(brand.brandName));
assert.ok(overlay.includes(brand.contact.phone));
assert.ok(overlay.includes(verifiedProduct.verifiedBenefits[0]));
assert.ok(overlay.includes("studio-rim-glow"));
assert.ok(overlay.includes("contact-shadow"));
assert.equal(overlay.includes("price-card"), false);
assert.equal(overlay.includes("discount-badge"), false);

const defaultOverlay = OverlaySystem.generateOverlaySvg({
  width: 1080,
  height: 1920,
});
assert.ok(defaultOverlay.includes(brand.contact.phone));
assert.ok(defaultOverlay.includes("الصورة المرجعية غير متاحة"));

// --- Single-source guard ----------------------------------------------------
// Brand identity and contact details must only appear in brand-core.ts.
// Needles are derived from the config itself so this test never hardcodes them.

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

const normalized = (file: string) =>
  relative(repoRoot, file).split("\\").join("/");
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
  "Al Rahma pipeline tests passed: BrandConfig, deterministic copy, verified-source gate, active/expired promo rules, 48h cultural greeting trigger, 2-variant white/mesh composer with depth+lighting, packshot blocking, and single-source brand identity.",
);
