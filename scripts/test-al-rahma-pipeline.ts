import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import {
  AL_RAHMA_BRAND_CONFIG,
  ArabicCopywriter,
  OverlaySystem,
  ProductionEngine,
  QualityGate,
  resolveBackground,
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

// --- Production pipeline: two distinct variants -----------------------------

const variants = ProductionEngine.executeVariants({
  product: verifiedProduct,
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
  assert.equal(result.qualityReport.passed, true);
  assert.equal(
    /price|discount|salePrice|خصم|السعر|جنيه/i.test(result.svgOverlay),
    false,
    "The composer must not render pricing or discount badges.",
  );
}

assert.ok(variants[0].svgOverlay.includes("studio-glow"));
assert.ok(variants[1].svgOverlay.includes("studio-accents"));

const single = ProductionEngine.execute({ product: verifiedProduct });
assert.equal(single.variant, "hero-clean");
assert.equal(single.success, true);

// Missing authentic packshot blocks production instead of inventing an image.
const blocked = ProductionEngine.executeVariants({
  product: { ...verifiedProduct, productImageUrl: null },
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
  "Al Rahma pipeline tests passed: BrandConfig contract, price-free deterministic copy, verified-source gate, 2-variant white/mesh composer, packshot blocking, and single-source brand identity.",
);
