import { strict as assert } from "node:assert";
import {
  assertNoLegacyBrandLeak,
  assertSafeZones,
  assertTenantBrandExclusive,
  cleanMarketingText,
  isRawFilename,
  pickMarketingText,
} from "../src/lib/al-rahma/strict-design-rules";
import {
  assertZonesDoNotOverlap,
  createAdZones,
  fitText,
} from "../src/lib/al-rahma/layout-geometry";
import { AL_RAHMA_BRAND_CONFIG, buildBrandConfigFromTenant } from "../src/lib/al-rahma/brand-core";
import { ArabicCopywriter } from "../src/lib/al-rahma/arabic-copywriter";
import { OverlaySystem } from "../src/lib/al-rahma/overlay-system";
import { ProductionEngine } from "../src/lib/al-rahma/production-engine";
import { parseProductVisualBrief } from "../src/lib/al-rahma/product-visual-brief";
import { buildStudioSalesLine } from "../src/lib/al-rahma/studio-fields";

const baseBrand = AL_RAHMA_BRAND_CONFIG;
const rawFileNames = [
  "WhatsApp Image 2026-01-01 at 10.00.00.jpg",
  "IMG_8392.JPG",
  "DSC_0042.HEIC",
  "photo_2026-01-01_10-00-00.png",
  "Screenshot 2026-01-01 100000.png",
  "0123456789abcdef0123456789abcdef.jpg",
];

for (const fileName of rawFileNames) {
  assert.equal(isRawFilename(fileName), true, `${fileName} must be treated as storage noise`);
  assert.equal(
    cleanMarketingText(fileName, "Clean product"),
    "Clean product",
    `${fileName} must never reach marketing copy`,
  );
}
assert.equal(isRawFilename("شامبو العناية اليومي"), false);
assert.equal(isRawFilename("Acme Vitamin C Serum"), false);
assert.equal(cleanMarketingText("شامبو العناية اليومي", "fallback"), "شامبو العناية اليومي");
assert.equal(pickMarketingText([rawFileNames[0], "شامبو العناية"], "fallback"), "شامبو العناية");

// Upload/vision sales-line fallbacks must never echo the source filename.
const filenameSalesLine = buildStudioSalesLine({
  fileName: rawFileNames[0],
});
assert.equal(/whatsapp|image|img|jpe?g/i.test(filenameSalesLine), false);
assert.equal(
  filenameSalesLine,
  "منتج مختار بعناية لك",
  "a filename-only upload must fall back to neutral copy",
);

const briefFromRaw = parseProductVisualBrief(
  {
    identity: rawFileNames[1],
    shortSalesLine: rawFileNames[1],
    category: rawFileNames[1],
  },
  "ar",
  { identity: rawFileNames[2], category: rawFileNames[2], industry: rawFileNames[2] },
);
assert.equal(isRawFilename(briefFromRaw.identity), false);
assert.equal(isRawFilename(briefFromRaw.shortSalesLine), false);
assert.equal(isRawFilename(briefFromRaw.category), false);
assert.equal(isRawFilename(briefFromRaw.industry), false);

// Conditional commercial metadata: absent stays absent, supplied is rendered.
const emptyOverlay = OverlaySystem.generateOverlaySvg({
  headline: "Clean product",
  productImageUrl: "https://example.test/product.png",
});
assert.equal(emptyOverlay.includes("promo-badge"), false);
assert.equal(emptyOverlay.includes("operator-offer-badge"), false);
assert.equal(emptyOverlay.includes("data-price"), false);

const priceOnly = OverlaySystem.generateOverlaySvg({
  headline: "Clean product",
  productImageUrl: "https://example.test/product.png",
  priceText: "100 ج.م",
});
assert.equal(priceOnly.includes("promo-badge"), false);
assert.equal(priceOnly.includes('id="operator-offer-badge"'), true);
assert.equal(priceOnly.includes("100 ج.م"), true);

const offerOnly = OverlaySystem.generateOverlaySvg({
  headline: "Clean product",
  productImageUrl: "https://example.test/product.png",
  offerText: "عرض المنتج",
});
assert.equal(offerOnly.includes("promo-badge"), false);
assert.equal(offerOnly.includes("عرض المنتج"), true);

const invalidCommercial = OverlaySystem.generateOverlaySvg({
  headline: "Clean product",
  productImageUrl: "https://example.test/product.png",
  priceText: "free",
  offerText: "علاج طبي مضمون",
});
assert.equal(invalidCommercial.includes("operator-offer-badge"), false);

const promoOverlay = OverlaySystem.generateOverlaySvg({
  headline: "Clean product",
  productImageUrl: "https://example.test/product.png",
  promotion: {
    id: "promo",
    discountPercent: 10,
    originalPrice: 100,
    promoPrice: 90,
    startsAt: "2026-01-01",
    endsAt: "2026-12-31",
  },
});
assert.equal(promoOverlay.includes("promo-badge"), true);
assert.equal(promoOverlay.includes("خصم 10%"), true);

// Zero clipping and zero collisions for both directions and both layouts.
const sampleText =
  "جودة عناية موثقة تصلك بسرعة مع تغليف أنيق وخدمة عملاء مميزة ومتابعة كاملة";
for (const direction of ["rtl", "ltr"] as const) {
  for (const hasCommercial of [false, true]) {
    const zones = createAdZones(1080, 1920, {
      price: hasCommercial,
      offer: hasCommercial,
    });
    assert.equal(assertZonesDoNotOverlap(zones), true, "safe zones must not collide");
    assert.doesNotThrow(() =>
      assertSafeZones({
        logo: zones.logoZone,
        headline: zones.headlineZone,
        product: zones.productZone,
        footer: zones.brandContactZone,
        price: zones.priceZone ?? undefined,
        offer: zones.offerZone ?? undefined,
      }),
    );

    const fitted = fitText(sampleText, zones.headlineZone, direction, 72, 20);
    assert.ok(fitted.fontSize >= 20);
    assert.ok(fitted.lines.length > 0);
    assert.ok(
      fitted.lines.length * fitted.lineHeight <= zones.headlineZone.height,
      `${direction} text must not overflow the headline zone`,
    );
    const chars = Math.max(
      4,
      Math.floor(zones.headlineZone.width / (fitted.fontSize * 0.58)),
    );
    for (const line of fitted.lines) {
      assert.ok(line.length <= chars, `${direction} line must not clip horizontally`);
    }
  }
}

assert.throws(() =>
  assertSafeZones({
    logo: { x: 950, y: 40, width: 200, height: 140 },
    headline: { x: 40, y: 40, width: 700, height: 180 },
    product: { x: 180, y: 350, width: 720, height: 920 },
    footer: { x: 0, y: 1750, width: 1080, height: 170 },
  }),
  /clip|overlap/,
);
assert.throws(() =>
  assertSafeZones({
    logo: { x: 900, y: 40, width: 140, height: 140 },
    headline: { x: 40, y: 40, width: 900, height: 180 },
    product: { x: 180, y: 350, width: 720, height: 920 },
    footer: { x: 0, y: 1750, width: 1080, height: 170 },
  }),
  /overlap/,
);

// Strict tenant isolation: the locked brand replaces every default identity.
const tenantBrand = buildBrandConfigFromTenant({
  brandName: "Acme Pharmacy",
  industry: "pharmacy",
  phone: "01000000000",
  tagline: "عناية يومية موثوقة",
  hashtags: ["#Acme"],
});
assert.equal(tenantBrand.brandName, "Acme Pharmacy");
assert.equal(
  tenantBrand.tagline.includes(baseBrand.tagline),
  false,
  "tenant tagline must not inherit the legacy marketing line",
);
assert.equal(
  tenantBrand.hashtags.includes(baseBrand.hashtags[0]!),
  false,
  "tenant hashtags must not inherit legacy tags",
);
assert.equal(
  tenantBrand.contact.phone === baseBrand.contact.phone,
  false,
  "tenant contact must not silently inherit the legacy phone",
);

const partialTenant = buildBrandConfigFromTenant({
  brandName: "Acme Pharmacy",
  industry: "pharmacy",
});
assert.equal(partialTenant.contact.phone, "");
assert.equal(partialTenant.contact.whatsappUrl, "");
assert.equal(partialTenant.tagline, "pharmacy");

assert.doesNotThrow(() => assertTenantBrandExclusive(null, baseBrand));
assert.throws(() => assertTenantBrandExclusive({ brandName: "Acme Pharmacy" }, baseBrand));
assert.doesNotThrow(() => assertTenantBrandExclusive({ brandName: "Acme Pharmacy" }, tenantBrand));
assert.doesNotThrow(() =>
  assertTenantBrandExclusive({ brand: { brandName: "Acme Pharmacy" } }, tenantBrand),
);
assert.throws(() =>
  assertNoLegacyBrandLeak(`من ${baseBrand.brandName} مباشرة`, tenantBrand),
);

const isolatedProduct = {
  title: "شامبو العناية الموثق",
  category: "العناية بالشعر",
  sourceUrl: "https://example.test/source",
  verificationStatus: "verified",
  verifiedBenefits: ["ترطيب عميق يدوم طويلاً للشعر"],
  productImageUrl: "https://example.test/packshot.png",
  warehouseStockStatus: "in_stock" as const,
};

const tenantCopy = ArabicCopywriter.generatePost(
  { ...isolatedProduct, verifiedBenefits: [] },
  "product_information",
  { variant: 2, brand: tenantBrand },
);
assert.equal(tenantCopy.fullPostText.includes(baseBrand.brandName), false);
assert.equal(tenantCopy.socialCaption.includes(baseBrand.brandName), false);

const tenantOverlay = OverlaySystem.generateOverlaySvg({
  headline: "عرض خاص",
  benefitLine: "جودة طازجة كل يوم",
  brand: tenantBrand,
  productImageUrl: isolatedProduct.productImageUrl,
});
assert.equal(tenantOverlay.includes(tenantBrand.brandName), true);
assert.equal(tenantOverlay.includes(baseBrand.brandName), false);
assert.equal(tenantOverlay.includes(baseBrand.contact.phone), false);

const tenantProduction = ProductionEngine.execute({
  product: isolatedProduct,
  brand: tenantBrand,
  today: "2026-01-01",
});
assert.equal(tenantProduction.svgOverlay.includes(tenantBrand.brandName), true);
assert.equal(tenantProduction.svgOverlay.includes(baseBrand.brandName), false);
assert.equal(tenantProduction.svgOverlay.includes(baseBrand.contact.phone), false);

// The rendered pipeline must also reject raw filenames and absent prices.
const rawTitle = rawFileNames[0]!;
const rawProduction = ProductionEngine.execute({
  product: { ...isolatedProduct, title: rawTitle },
  today: "2026-01-01",
});
assert.equal(isRawFilename(rawProduction.metadata.productName), false);
assert.equal(isRawFilename(rawProduction.copy.headline), false);
assert.equal(/whatsapp|img_|\.jpe?g/i.test(rawProduction.svgOverlay), false);
assert.equal(rawProduction.metadata.priceText, null);
assert.equal(rawProduction.svgOverlay.includes("operator-offer-badge"), false);

const pricedProduction = ProductionEngine.execute({
  product: isolatedProduct,
  price: 125,
  today: "2026-01-01",
});
assert.equal(pricedProduction.metadata.priceText, "125 ج.م");
assert.equal(pricedProduction.svgOverlay.includes("operator-offer-badge"), true);

const unpricedProduction = ProductionEngine.execute({
  product: isolatedProduct,
  offerText: "علاج طبي مضمون",
  today: "2026-01-01",
});
assert.equal(unpricedProduction.metadata.offerText, null);
assert.equal(unpricedProduction.svgOverlay.includes("operator-offer-badge"), false);

console.log("strict design rule compliance checks passed");
