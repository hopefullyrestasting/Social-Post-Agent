import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import {
  AL_RAHMA_BRAND_CONFIG,
  ArabicCopywriter,
  OverlaySystem,
  ProductionEngine,
  QualityGate,
} from "../src/lib/al-rahma";

const product = {
  title: "منتج عناية",
  category: "hair_care",
  features: [],
};

const brand = AL_RAHMA_BRAND_CONFIG;

// --- BrandConfig contract ----------------------------------------------------

assert.match(brand.contact.phone, /^\d{11}$/);
assert.match(brand.contact.whatsappUrl, /^https:\/\/wa\.me\/\d+$/);
assert.match(brand.activity, /مستحضرات التجميل/);
assert.equal(brand.visual.format.width, 1080);
assert.equal(brand.visual.format.height, 1920);
assert.equal(brand.visual.format.orientation, "portrait");
assert.equal(brand.visual.background.style, "clean-white");
assert.equal(brand.visual.background.mesh.enabled, true);
assert.deepEqual(
  JSON.parse(JSON.stringify(brand)),
  brand,
  "BrandConfig must stay plain JSON-serializable data.",
);

// --- Copywriting / quality gate ---------------------------------------------

const copy = ArabicCopywriter.generatePost(product, "product_information");
assert.equal(copy.priceTag, "");
assert.ok(copy.fullPostText.includes(product.title));
assert.ok(copy.fullPostText.includes(brand.contact.phone));
assert.ok(copy.cta.includes(brand.contact.phone));
assert.equal(copy.body.includes("0 ج.م"), false);
assert.equal(copy.body.includes("معاينة الشحنة"), false);
assert.equal(copy.body.includes("شحن فوري"), false);

const quality = QualityGate.evaluate(copy, product, {
  width: 1080,
  height: 1920,
});
assert.equal(quality.passed, false);
assert.ok(quality.errors.some((error) => error.includes("مصدر")));

// --- Production pipeline ----------------------------------------------------

const result = ProductionEngine.execute({ product });
assert.equal(result.success, false);
assert.equal(result.metadata.salePrice, 0);
assert.deepEqual(result.metadata.dimensions, {
  width: brand.visual.format.width,
  height: brand.visual.format.height,
});
assert.equal(result.svgOverlay.includes("price-card"), false);
assert.equal(result.svgOverlay.includes("discount-badge"), false);
assert.ok(result.svgOverlay.includes(brand.contact.phone));

const overlay = OverlaySystem.generateOverlaySvg({
  width: 1080,
  height: 1920,
  showLogo: true,
  showPriceTag: false,
  showDiscountBadge: false,
  footerText: `للطلب والاستفسار: ${brand.contact.phone}`,
});
assert.ok(overlay.includes(brand.brandName));
assert.ok(overlay.includes(brand.contact.phone));

const defaultOverlay = OverlaySystem.generateOverlaySvg({
  width: 1080,
  height: 1920,
});
assert.ok(defaultOverlay.includes(brand.contact.phone));

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
  "Al Rahma pipeline tests passed: BrandConfig contract, truthful copy, source gate, price-free artwork, and single-source brand identity.",
);
