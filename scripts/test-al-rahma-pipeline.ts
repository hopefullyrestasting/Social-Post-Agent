import assert from "node:assert/strict";
import {
  AL_RAHMA_BRAND_CORE,
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

assert.equal(AL_RAHMA_BRAND_CORE.contactInfo.phone, "01000017548");
assert.equal(
  AL_RAHMA_BRAND_CORE.contactInfo.whatsapp,
  "https://wa.me/20100017548",
);
assert.match(AL_RAHMA_BRAND_CORE.industry, /مستحضرات التجميل/);

const copy = ArabicCopywriter.generatePost(product, "product_information");
assert.equal(copy.priceTag, "");
assert.ok(copy.fullPostText.includes(product.title));
assert.ok(copy.fullPostText.includes(AL_RAHMA_BRAND_CORE.contactInfo.phone));
assert.equal(copy.body.includes("0 ج.م"), false);
assert.equal(copy.body.includes("معاينة الشحنة"), false);
assert.equal(copy.body.includes("شحن فوري"), false);

const quality = QualityGate.evaluate(copy, product, {
  width: 1080,
  height: 1920,
});
assert.equal(quality.passed, false);
assert.ok(quality.errors.some((error) => error.includes("مصدر")));

const result = ProductionEngine.execute({ product, width: 1080, height: 1920 });
assert.equal(result.success, false);
assert.equal(result.metadata.salePrice, 0);
assert.equal(result.svgOverlay.includes("price-card"), false);
assert.equal(result.svgOverlay.includes("discount-badge"), false);
assert.ok(result.svgOverlay.includes("01000017548"));

const overlay = OverlaySystem.generateOverlaySvg({
  width: 1080,
  height: 1920,
  showLogo: true,
  showPriceTag: false,
  showDiscountBadge: false,
  footerText: "للطلب والاستفسار: 01000017548",
});
assert.ok(overlay.includes("مخزن الرحمة"));
assert.ok(overlay.includes("01000017548"));

console.log("Al Rahma pipeline tests passed: identity, truthful copy, source gate, and price-free artwork.");
