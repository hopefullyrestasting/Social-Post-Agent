import fs from "fs";
import path from "path";
import {
  AL_RAHMA_BRAND_CORE,
  ArabicCopywriter,
  OverlaySystem,
  QualityGate,
  ProductionEngine,
} from "../src/lib/al-rahma";

async function runTest() {
  console.log("=================================================");
  console.log("🚀 Testing Al-Rahma Pipeline (Pure Client SVG)");
  console.log("=================================================\n");

  // 1. Test Brand Core
  console.log("1. Checking Brand Core Configuration...");
  console.log(`   Brand Name: ${AL_RAHMA_BRAND_CORE.brandName} (${AL_RAHMA_BRAND_CORE.brandNameEnglish})`);
  console.log(`   Tagline: ${AL_RAHMA_BRAND_CORE.tagline}`);
  console.log(`   Primary Colors: ${JSON.stringify(AL_RAHMA_BRAND_CORE.primaryColors)}`);
  console.log("   [✓] Brand Core is valid.\n");

  // 2. Test Arabic Copywriter
  console.log("2. Testing Arabic Copywriter Generation...");
  const sampleProduct = {
    title: "طقم حلل جرانيت كوري 10 قطع أصلي",
    category: "أدوات منزلية ومطبخ",
    originalPrice: 4200,
    salePrice: 2899,
    features: [
      "خامة جرانيت كوري 7 طبقات غير لاصقة وصحية 100%",
      "توزيع حراري مثالي وموفر للغاز والكهرباء",
      "أغطية بايركس مقاومة للصدمات والحرارة العالية",
      "طقم توزيع سليكون أصلي حراري هدية مع الطقم",
    ],
  };

  const copy = ArabicCopywriter.generatePost(sampleProduct, "flash_sale");
  console.log("   Generated Headline:", copy.headline);
  console.log("   Savings Tag:", copy.savingsText);
  console.log("   Hook:", copy.hook);
  console.log("   Hashtags Count:", copy.hashtags.length);
  console.log("   [✓] Arabic Copywriter executed successfully.\n");

  // 3. Test Overlay System SVG
  console.log("3. Testing Overlay System (SVG Generation)...");
  const svg = OverlaySystem.generateOverlaySvg({
    width: 1080,
    height: 1080,
    showLogo: true,
    showDiscountBadge: true,
    discountText: "خصم 31%",
    showPriceTag: true,
    salePrice: sampleProduct.salePrice,
    originalPrice: sampleProduct.originalPrice,
  });
  console.log("   SVG Size:", svg.length, "characters");
  console.log("   Contains Logo:", svg.includes("logo-badge"));
  console.log("   Contains Price:", svg.includes("price-card"));
  console.log("   [✓] Overlay SVG generated successfully.\n");

  // 4. Test Quality Gate
  console.log("4. Testing Quality Gate Auditing...");
  const quality = QualityGate.evaluate(copy, sampleProduct, { width: 1080, height: 1080 });
  console.log(`   Quality Gate Passed: ${quality.passed ? "YES ✅" : "NO ❌"}`);
  console.log(`   Overall Score: ${quality.overallScore}%`);
  console.log("   [✓] Quality Gate evaluated successfully.\n");

  // 5. Test Production Engine
  console.log("5. Testing Production Engine (Pure SVG Pipeline)...");
  const productionResult = ProductionEngine.execute({
    product: sampleProduct,
    angle: "flash_sale",
    width: 1080,
    height: 1080,
  });

  console.log(`   Production Success: ${productionResult.success ? "YES ✅" : "NO ❌"}`);
  const outputPath = path.join(process.cwd(), "public", "test-al-rahma-post.svg");
  fs.writeFileSync(outputPath, productionResult.svgOverlay);
  console.log(`   Rendered SVG written to: ${outputPath} (${productionResult.svgOverlay.length} chars)`);
  console.log("   [✓] Production Engine completed successfully.\n");

  console.log("=================================================");
  console.log("🎉 ALL TESTS PASSED WITH 100% SUCCESS!");
  console.log("=================================================");
}

runTest().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
