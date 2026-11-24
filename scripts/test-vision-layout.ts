import { strict as assert } from "node:assert";
import {
  isIndustryCompatible,
  optionalProductVisualBrief,
  parseProductVisualBrief,
} from "../src/lib/al-rahma/product-visual-brief";
import {
  assertZonesDoNotOverlap,
  createAdZones,
  fitText,
} from "../src/lib/al-rahma/layout-geometry";
import {
  buildDesignPromptBlock,
  visualBriefDirective,
} from "../src/lib/al-rahma/design-library";
import { resolveSalesLine } from "../src/lib/al-rahma/studio-fields";

const brief = parseProductVisualBrief(
  { identity: "Brake cleaner", category: "automotive", industry: "automotive", primaryFunction: "Cleans brake parts", dominantTones: ["silver", "black"], surfaceFinish: "metallic", palette: ["#FFFFFF", "#1D4ED8"], lightingMood: "cool-studio", shortSalesLine: "Quality brake components for drivers" },
  "en",
  { identity: "Cleaner", category: "automotive", industry: "automotive" },
);
assert.equal(brief.primaryFunction, "Cleans brake parts");
assert.equal(brief.lightingMood, "cool-studio");
assert.equal(isIndustryCompatible("automotive", "beauty", "Spa serum"), false);
assert.equal(optionalProductVisualBrief(undefined, "en", { identity: "x", category: "y", industry: "z" }), null);
assert.equal(assertZonesDoNotOverlap(createAdZones(1080, 1920, { offer: true, price: true })), true);
for (const direction of ["rtl", "ltr"] as const) {
  const fitted = fitText("A concise, verified sales line that fits safely", createAdZones(1080, 1920).headlineZone, direction);
  assert.ok(fitted.lines.length > 0);
  assert.ok(fitted.fontSize >= 20);
}

// Visual-brief prompts may guide staging but must never smuggle a claim into copy.
const stagingDirective = visualBriefDirective(brief);
assert.match(stagingDirective, /PRODUCT VISUAL BRIEF/);
assert.match(stagingDirective, /dominant tones silver, black/);
assert.match(stagingDirective, /surface finish metallic/);
assert.doesNotMatch(stagingDirective, /Quality brake components for drivers/);
const genericBrief = parseProductVisualBrief({}, "ar", {
  identity: "منتج",
  category: "عام",
  industry: "general",
});
assert.equal(visualBriefDirective(genericBrief), "");
assert.match(
  buildDesignPromptBlock({ slot: 1, context: { visualBrief: brief } }),
  /PRODUCT VISUAL BRIEF/,
);

assert.equal(
  resolveSalesLine({ salesLine: null, visualBrief: brief }),
  brief.shortSalesLine,
);
assert.equal(
  resolveSalesLine({
    salesLine: null,
    visualBrief: { ...brief, shortSalesLine: "علاج مضمون فوراً" },
  }),
  "",
  "unsafe vision copy must be dropped, not rewritten into a claim",
);
console.log("vision brief and layout geometry checks passed");
