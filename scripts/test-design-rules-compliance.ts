import { strict as assert } from "node:assert";
import { cleanMarketingText, assertSafeZones, assertTenantBrandExclusive } from "../src/lib/al-rahma/strict-design-rules";
import { fitText } from "../src/lib/al-rahma/layout-geometry";
import { OverlaySystem } from "../src/lib/al-rahma/overlay-system";
import { AL_RAHMA_BRAND_CONFIG } from "../src/lib/al-rahma/brand-core";

assert.equal(cleanMarketingText("WhatsApp Image 2026-01-01 at 10.00.00.jpg", "Clean product"), "Clean product");
assert.equal(cleanMarketingText("IMG_8392.JPG", "Clean product"), "Clean product");
for (const direction of ["rtl", "ltr"] as const) { const fitted=fitText("A concise verified product message that must fit", {x:40,y:40,width:700,height:180}, direction); assert.ok(fitted.fontSize >= 20 && fitted.lines.length > 0); }
assert.throws(() => assertSafeZones({logo:{x:900,y:40,width:140,height:140},headline:{x:40,y:40,width:700,height:180},product:{x:180,y:350,width:720,height:920},footer:{x:0,y:1750,width:1080,height:170},price:{x:30,y:1680,width:300,height:100},offer:{x:750,y:1680,width:300,height:100}}));
assert.doesNotThrow(() => assertSafeZones({logo:{x:900,y:40,width:140,height:140},headline:{x:40,y:40,width:700,height:180},product:{x:180,y:350,width:720,height:920},footer:{x:0,y:1750,width:1080,height:170},price:{x:30,y:1580,width:300,height:100},offer:{x:750,y:1580,width:300,height:100}}));
assert.throws(() => assertTenantBrandExclusive({brand:{brandName:"Tenant A"}} as never, AL_RAHMA_BRAND_CONFIG));
const tenantBrand={...AL_RAHMA_BRAND_CONFIG,id:"tenant-a",brandName:"Tenant A",brandNameEnglish:"Tenant A"};
assert.doesNotThrow(() => assertTenantBrandExclusive({brand:{brandName:"Tenant A"}} as never, tenantBrand));
const withoutPromo=OverlaySystem.generateOverlaySvg({headline:"Clean product",productImageUrl:"https://example.test/product.png"});
assert.equal(withoutPromo.includes("promo-badge"), false);
const withPromo=OverlaySystem.generateOverlaySvg({headline:"Clean product",productImageUrl:"https://example.test/product.png",promotion:{id:"p",discountPercent:10,originalPrice:100,promoPrice:90,startsAt:"2026-01-01",endsAt:"2026-12-31"}});
assert.equal(withPromo.includes("promo-badge"), true);
console.log("strict design rule compliance checks passed");
