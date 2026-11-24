import { strict as assert } from "node:assert";
import { parseProductVisualBrief, isIndustryCompatible } from "../src/lib/al-rahma/product-visual-brief";
import { assertZonesDoNotOverlap, createAdZones, fitText } from "../src/lib/al-rahma/layout-geometry";

const brief = parseProductVisualBrief(
  { identity: "Brake cleaner", category: "automotive", industry: "automotive", primaryFunction: "Cleans brake parts", dominantTones: ["silver", "black"], surfaceFinish: "metallic", palette: ["#FFFFFF", "#1D4ED8"], lightingMood: "cool-studio", shortSalesLine: "Clean braking parts with confidence" },
  "en",
  { identity: "Cleaner", category: "automotive", industry: "automotive" },
);
assert.equal(brief.primaryFunction, "Cleans brake parts");
assert.equal(brief.lightingMood, "cool-studio");
assert.equal(isIndustryCompatible("automotive", "beauty", "Spa serum"), false);
assert.equal(assertZonesDoNotOverlap(createAdZones(1080, 1920, { offer: true, price: true })), true);
for (const direction of ["rtl", "ltr"] as const) {
  const fitted = fitText("A concise, verified sales line that fits safely", createAdZones(1080, 1920).headlineZone, direction);
  assert.ok(fitted.lines.length > 0);
  assert.ok(fitted.fontSize >= 20);
}
console.log("vision brief and layout geometry checks passed");
