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
import { removePackshotBackgroundServer } from "../functions/api/ai/remove-bg";

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

assert.equal(templateForVariant(1, "seed"), "simple-botanical-horizon");
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
  ["simple-botanical-horizon", templateForVariant(2, verifiedProduct.title)],
);
assert.deepEqual(variants.map((r) => r.variantNumber), [1, 2]);
assert.equal(variants[0].variant, "simple-botanical-horizon");
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
    assert.ok(result.svgOverlay.includes('data-packshot="true"'), "Packshot must be marked for compositing.");

    // Phase 18: hero seated flush on the horizon with a true mirror reflection,
    // no podium, no white box, zero white rectangle in main or reflection.
    assert.equal(result.svgOverlay.includes('id="shader-podium"'), false, "No shader podium allowed in Phase 18.");
    assert.equal(result.svgOverlay.includes('id="studio-podium"'), false, "No studio podium allowed in Phase 18.");
    assert.equal(/id="[^"]*podium[^"]*"/.test(result.svgOverlay), false, "No podium element markup allowed in Phase 18.");
    assert.ok(
      result.svgOverlay.includes('x="190" y="380" width="700" height="860"'),
      "Hero packshot must use Simple geometry (x=190,y=380,w=700,h=860) seated on y=1240.",
    );
    assert.equal(result.svgOverlay.includes('height="1200"'), false, "Phase 17 full-bleed hero must be gone.");
    assert.ok(result.svgOverlay.includes('id="packshot-reflection"'), "Hero must render a clipped mirror reflection group.");
    assert.ok(result.svgOverlay.includes('data-reflection="true"'), "Reflection image must be marked data-reflection=true for PNG export.");
    assert.ok(
      result.svgOverlay.includes('transform="translate(0, 2480) scale(1, -1)"'),
      "Reflection must flip the packshot vertically about y=1240.",
    );
    assert.ok(
      result.svgOverlay.includes('data-reflect-from="1240"') &&
        result.svgOverlay.includes('data-reflect-to="1510"'),
      "Reflection must be clipped to y=1240..1510.",
    );
    assert.ok(result.svgOverlay.includes('mask="url(#reflection-fade)"'), "Reflection must use the alpha-fade mask.");
    assert.ok(result.svgOverlay.includes('filter="url(#reflection-blur)"'), "Reflection must use the blur filter.");
    assert.ok(result.svgOverlay.includes('stdDeviation="2.5"'), "Reflection blur must be 2.5px.");
    assert.ok(result.svgOverlay.includes('stop-opacity="0.34"'), "Reflection must start at 0.34 alpha.");
    // External (non-transparent PNG data URI) packshots use multiply to melt white padding.
    assert.ok(result.svgOverlay.includes('mix-blend-mode:multiply'), "Non-cutout packshot must use mix-blend-mode:multiply to remove white box.");
    assert.ok(result.svgOverlay.includes('data-blend="multiply"'), "Non-cutout packshot must be marked data-blend=multiply.");

    assert.ok(result.svgOverlay.includes('id="top-header-pill"'), "Top dark-emerald header pill must render.");
    assert.ok(
      result.svgOverlay.includes('x="40" y="36" width="1000" height="120"'),
      "Header glass pill must use Simple geometry (y=36..156).",
    );
    assert.ok(
      result.svgOverlay.includes('fill="#0C3024"') && result.svgOverlay.includes('fill-opacity="0.85"'),
      "Header must use translucent dark-emerald glass (#0C3024 at 0.85).",
    );
    assert.ok(
      result.svgOverlay.includes('id="header-divider"') &&
        result.svgOverlay.includes('x1="685"') &&
        result.svgOverlay.includes('y1="56"') &&
        result.svgOverlay.includes('x2="685"') &&
        result.svgOverlay.includes('y2="136"'),
      "Header must include vertical divider at approved coordinates.",
    );
    assert.ok(
      result.svgOverlay.includes('x="655" y="99"') &&
        result.svgOverlay.includes('font-size="24"') &&
        result.svgOverlay.includes('fill="#E2E8F0"'),
      "Header tagline must use approved coordinates/typography.",
    );
    assert.ok(result.svgOverlay.includes("مستحضرات تجميل ومستلزمات الصيدليات - متاح توصيل"), "Header activity/delivery text must match approved lockup.");
    assert.ok(result.svgOverlay.includes('id="product-title"'), "Product title block must render.");
    assert.ok(
      result.svgOverlay.includes('font-size="58"') &&
        result.svgOverlay.includes('fill="#FFFFFF"') &&
        result.svgOverlay.includes('filter="url(#title-soft-shadow)"'),
      "Product title must use pure-white 58px Cairo 900 with soft shadow.",
    );
    assert.equal(result.svgOverlay.includes("تركيبة طبيعية"), false, "Side feature pills must be removed.");
    assert.equal(result.svgOverlay.includes("جودة مضمونة"), false, "Side feature pills must be removed.");
    assert.equal(result.svgOverlay.includes('id="feature-pills"'), false, "Side feature pills group must be removed.");
    assert.ok(result.svgOverlay.includes('id="sales-copy-editorial"'), "Editorial sales copy must render directly over photography.");
    assert.equal(result.svgOverlay.includes('id="sales-copy-card"'), false, "Bulky white sales copy card must be removed.");
    assert.ok(
      result.svgOverlay.includes('font-size="46"') &&
        result.svgOverlay.includes('font-weight="800"') &&
        result.svgOverlay.includes('fill="#FFFFFF"'),
      "Benefit line must use pure-white 46px Cairo 800 editorial typography.",
    );
    assert.ok(result.svgOverlay.includes('bottom-editorial-vignette'), "Sales copy must include subtle bottom vignette/scrim.");
    assert.equal(
      result.svgOverlay.includes('id="availability-pill"'),
      result.template !== "simple-botanical-horizon",
      "Simple variant suppresses the availability pill; secondary templates keep it.",
    );
    assert.equal(
      result.svgOverlay.includes('id="cta-pill"'),
      result.template !== "simple-botanical-horizon",
      "Simple variant suppresses the CTA pill; secondary templates keep it.",
    );
    assert.ok(result.svgOverlay.includes('y="1745"') && result.svgOverlay.includes('height="175"'), "Bottom contact bar must use Simple geometry.");
    assert.ok(result.svgOverlay.includes('fill="#0D3829"'), "Contact bar must use deep dark-emerald #0D3829.");
    assert.ok(result.svgOverlay.includes('x="955"') && result.svgOverlay.includes('font-size="42"'), "Contact label must use approved coordinates/typography.");
    assert.ok(result.svgOverlay.includes('x="540"') && result.svgOverlay.includes('font-size="52"'), "Phone number must be centered with approved coordinates/typography.");
    assert.ok(
      result.svgOverlay.includes('cx="240" cy="1833"') && result.svgOverlay.includes('cx="150" cy="1833"') && result.svgOverlay.includes('r="30"'),
      "Contact icons must be placed away from phone digits with r=30.",
    );
    assert.ok(result.svgOverlay.includes("\u200Fللتواصل:") && result.svgOverlay.includes(brand.contact.phone), "Contact bar must render label and phone.");
    assert.equal(result.svgOverlay.includes('href="/studio-scenes/'), false, "External studio scene URLs must never be emitted in SVG (PNG export safety).");
    assert.ok(result.svgOverlay.includes("#059669"), "Contact icons must include emerald accent styling.");
    assert.ok(result.copy.socialCaption && result.copy.socialCaption.includes(result.copy.ctaShort), "Each creative must include a ready-to-copy socialCaption with CTA.");
    assert.ok((result.copy.socialCaption.match(/•/g) || []).length >= 3, "socialCaption must include 3 benefit lines.");
    assert.ok(result.copy.socialCaption.includes("#"), "socialCaption must include hashtags.");
    assert.equal(result.qualityReport.passed, true);
    assert.equal(result.metadata.promotion, null);
    assert.equal(result.metadata.occasion, null);
    assert.equal(result.svgOverlay.includes("promo-badge"), false, "No promo without an active in-window record.");
    assert.equal(result.svgOverlay.includes("occasion-ribbon"), false, "No greeting without an in-window occasion.");
  }

assert.equal(/id="[^"]*podium[^"]*"/.test(variants[0].svgOverlay), false, "Variant 1 must have no podium markup in Phase 18.");
assert.equal(variants[0].svgOverlay.includes('id="packshot-hero"'), true, "Variant 1 must include the Simple hero packshot.");
assert.equal(variants[0].svgOverlay.includes('data-blend="multiply"'), true, "Variant 1 non-cutout packshot must be multiply-blended.");
assert.ok(variants[0].svgOverlay.includes('id="simple-botanical-horizon"'), "Variant 1 must use the simple-botanical-horizon scene.");
assert.ok(variants[0].svgOverlay.includes('data-horizon-y="1240"'), "Simple scene horizon must sit at y=1240.");
assert.ok(variants[0].svgOverlay.includes('id="horizon-line"'), "Simple scene must render the glossy horizon line.");
assert.ok(variants[0].svgOverlay.includes('id="botanical-base"'), "Simple scene must render the botanical base cluster.");
assert.ok(
  variants[0].svgOverlay.includes('id="cloud-left"') && variants[0].svgOverlay.includes('id="cloud-right"'),
  "Simple scene must render both volumetric clouds.",
);
assert.ok(variants[0].svgOverlay.includes('data-palette="golden-sage"'), "Haircare product must resolve to the golden-sage palette.");
assert.equal(variants[0].svgOverlay.includes('id="availability-pill"'), false, "Simple variant must not render the availability pill.");
assert.equal(variants[0].svgOverlay.includes('id="cta-pill"'), false, "Simple variant must not render the CTA pill.");
assert.ok(variants[1].svgOverlay.includes('id="cta-pill"'), "Secondary variant keeps the CTA pill.");

// Transparent PNG cutout renders normally (no multiply, with soft drop shadow).
const cutoutOverlay = OverlaySystem.generateOverlaySvg({
  width: 1080,
  height: 1920,
  template: "silver-podium-botanical",
  productImageUrl: "data:image/png;base64,abc",
  headline: verifiedProduct.title,
  benefitLine: "ترطيب عميق يدوم طويلاً للشعر",
  ctaText: "اطلب عبر واتساب",
  availabilityText: "متوفر في المخزن",
});
assert.ok(cutoutOverlay.includes('x="190" y="380" width="700" height="860"'), "Cutout hero must use Simple geometry.");
assert.ok(cutoutOverlay.includes('data-blend="cutout"'), "Transparent cutout must be marked data-blend=cutout.");
assert.equal(cutoutOverlay.includes('mix-blend-mode:multiply'), false, "Transparent cutout must not use multiply blend.");
assert.ok(cutoutOverlay.includes('filter="url(#soft-drop)"'), "Transparent cutout must render with soft drop shadow.");
assert.ok(cutoutOverlay.includes('id="packshot-reflection"'), "Cutout must also render a mirror reflection.");

const single = ProductionEngine.execute({ product: verifiedProduct, today: fixedToday });
assert.equal(single.variant, "simple-botanical-horizon");
assert.equal(single.template, "simple-botanical-horizon");
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

const simpleScene = resolveBackground({ width: 1080, height: 1920, template: "simple-botanical-horizon" });
assert.equal(simpleScene.provider, "deterministic-studio");
assert.equal(simpleScene.template, "simple-botanical-horizon");
assert.ok(simpleScene.markup.includes('id="simple-botanical-horizon"'));
assert.ok(simpleScene.markup.includes('data-horizon-y="1240"'));
assert.ok(simpleScene.markup.includes('id="horizon-line"'));
assert.ok(simpleScene.markup.includes('id="cloud-left"') && simpleScene.markup.includes('id="cloud-right"'));
assert.ok(simpleScene.markup.includes('id="botanical-base"'));
assert.ok(simpleScene.markup.includes('data-palette="fresh-sage"'));
assert.equal(/id="[^"]*podium[^"]*"/.test(simpleScene.markup), false, "Simple scene must never render a podium.");

const luxuryScene = resolveBackground({
  width: 1080,
  height: 1920,
  template: "simple-botanical-horizon",
  palette: "luxury-emerald",
});
assert.ok(luxuryScene.markup.includes('data-palette="luxury-emerald"'));
assert.ok(luxuryScene.markup.includes("#1B3B32"), "Luxury palette wall must match the approved emerald-charcoal.");
assert.ok(luxuryScene.markup.includes("#0B1B16"), "Luxury palette floor must match the approved deep emerald.");

const externalScene = resolveBackground({
  width: 1080,
  height: 1920,
  template: "botanical-arch-frame",
  sceneImageUrl: "https://image.pollinations.ai/prompt/test",
});
assert.equal(externalScene.provider, "deterministic-studio");
assert.equal(externalScene.kind, "scene");
assert.equal(externalScene.markup.includes('href="https://image.pollinations.ai/prompt/test"'), false);
assert.equal(/id="[^"]*podium[^"]*"/.test(externalScene.markup), false, "Non-data scene URLs must fall back to podium-free editorial vectors for PNG-safe export.");
assert.ok(
  externalScene.markup.includes("botanical-shadows") || externalScene.markup.includes("studio-wall"),
  "Fallback scene must use podium-free editorial backdrop markup.",
);

const workersScene = resolveBackground({
  width: 1080,
  height: 1920,
  template: "editorial-beauty-card",
  sceneImageUrl: "data:image/png;base64,abc",
});
assert.equal(workersScene.provider, "cloudflare-ai");
assert.equal(workersScene.kind, "image");

// --- Repo helpers ------------------------------------------------------------

const repoRoot = process.cwd();

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return /\.(ts|tsx)$/.test(entry.name) ? [fullPath] : [];
  });
}

const normalized = (file: string) => relative(repoRoot, file).split("\\").join("/");

(async () => {
// --- Server-side background removal (lightweight client, cloud/server processing) ---

const pkgJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
assert.equal(
  Boolean(pkgJson.dependencies?.["@imgly/background-removal"] || pkgJson.devDependencies?.["@imgly/background-removal"]),
  false,
  "@imgly/background-removal must not be present in package dependencies (client must stay lightweight).",
);

const clientSrcOffenders = walk(join(repoRoot, "src")).filter((file) =>
  readFileSync(file, "utf8").includes("@imgly/background-removal"),
);
assert.deepEqual(
  clientSrcOffenders.map((f) => normalized(f)),
  [],
  "Client src must not import @imgly/background-removal.",
);

// Fallback behavior: no AI provider / no remove.bg key and unreachable source -> null (caller falls back to original URL)
const bgFallbackResult = await removePackshotBackgroundServer(
  {},
  "https://example.invalid/not-reachable-packshot.png",
);
assert.equal(bgFallbackResult, null, "Server-side bg removal must fail gracefully and return null for fallback.");

// Private/blocked hosts must not be fetched
const bgBlockedResult = await removePackshotBackgroundServer(
  { AI: { run: async () => "x" } },
  "http://127.0.0.1/private.png",
);
assert.equal(bgBlockedResult, null, "Server-side bg removal must block private/local hosts.");

// --- Overlay ----------------------------------------------------------------

const overlay = OverlaySystem.generateOverlaySvg({
  width: 1080,
  height: 1920,
  template: "simple-botanical-horizon",
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
assert.equal(/id="[^"]*podium[^"]*"/.test(overlay), false, "Overlay must have no podium markup in Phase 18.");
assert.ok(overlay.includes('x="190" y="380" width="700" height="860"'));
assert.equal(overlay.includes('height="1200"'), false);
assert.ok(overlay.includes('id="packshot-reflection"'));
assert.ok(overlay.includes('transform="translate(0, 2480) scale(1, -1)"'));
assert.ok(overlay.includes('mask="url(#reflection-fade)"') && overlay.includes('filter="url(#reflection-blur)"'));
assert.ok(overlay.includes('stdDeviation="2.5"'));
assert.ok(overlay.includes('mix-blend-mode:multiply'), "Non-cutout overlay packshot must multiply-blend white padding.");
assert.ok(overlay.includes('data-blend="multiply"'));
assert.ok(overlay.includes('id="top-header-pill"'));
assert.ok(overlay.includes('fill="#0C3024"') && overlay.includes('fill-opacity="0.85"'));
assert.ok(overlay.includes('id="header-divider"') && overlay.includes('x1="685"') && overlay.includes('y1="56"'));
assert.ok(overlay.includes("مستحضرات تجميل ومستلزمات الصيدليات - متاح توصيل"));
assert.ok(overlay.includes('id="product-title"'));
assert.ok(overlay.includes('font-size="58"') && overlay.includes('filter="url(#title-soft-shadow)"'));
assert.equal(overlay.includes("تركيبة طبيعية"), false);
assert.equal(overlay.includes("جودة مضمونة"), false);
assert.equal(overlay.includes('id="feature-pills"'), false);
assert.ok(overlay.includes('id="sales-copy-editorial"'));
assert.equal(overlay.includes('id="sales-copy-card"'), false);
assert.ok(overlay.includes('font-size="46"') && overlay.includes('font-weight="800"'));
assert.equal(overlay.includes('id="cta-pill"'), false, "Simple overlay suppresses the CTA pill.");
assert.equal(overlay.includes('id="availability-pill"'), false, "Simple overlay suppresses the availability pill.");
assert.ok(overlay.includes('y="1745"') && overlay.includes('height="175"') && overlay.includes('fill="#0D3829"'));
assert.ok(overlay.includes('x="955"'));
assert.ok(overlay.includes('x="540"'));
assert.ok(overlay.includes('cx="240" cy="1833"') && overlay.includes('cx="150" cy="1833"') && overlay.includes('r="30"'));
assert.equal(overlay.includes('href="/studio-scenes/'), false);
assert.equal(overlay.includes("..."), false);

const defaultOverlay = OverlaySystem.generateOverlaySvg({ width: 1080, height: 1920 });
assert.ok(defaultOverlay.includes(brand.contact.phone));
assert.ok(defaultOverlay.includes("\u200Fللتواصل:"));
assert.ok(defaultOverlay.includes('id="simple-botanical-horizon"'), "Default overlay must use the Simple botanical horizon theme.");

// --- Single-source guard ----------------------------------------------------

const scannedDirs = ["src", "functions", "scripts"];
const configPath = "src/lib/al-rahma/brand-core.ts";
const needles = [
  brand.contact.phone,
  brand.contact.whatsappUrl.replace(/^https?:\/\//, ""),
  brand.brandName,
];

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
  "Al Rahma pipeline tests passed: BrandConfig, 4-8 benefit-only copy (no usage, no ellipsis), Simple botanical-horizon theme (horizon y=1240, volumetric clouds, botanical base, true mirror reflection, pure-white 58px/46px typography), adaptive palettes, multiply white-box protection, secondary variations, no podium or side pills, socialCaption, quality gate, promos, 48h cultural greeting, and single-source brand identity.",
);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
