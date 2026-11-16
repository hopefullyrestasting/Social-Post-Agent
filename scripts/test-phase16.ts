import assert from "node:assert/strict";
import { isProtectedRequest } from "../functions/api/_auth";
import {
  ART_DIRECTION_STYLES,
  ART_DIRECTION_STYLE_IDS,
  DEFAULT_ART_DIRECTION_STYLE,
  buildScenePrompt,
  detectBase64ImageMime,
  generateArtDirectedScene,
  styleForSeed,
  variantStylePair,
  type SceneEnv,
} from "../functions/api/ai/studio-scene";
import {
  buildHarvestQuery,
  extractPageImages,
  harvestRandomProducts,
  inferCategory,
  isForbiddenClaim,
  onRequestPost as postHarvestRandom,
  sanitizeBenefitLines,
  type HarvestEnv,
} from "../functions/api/ai/harvest-random";

/**
 * Phase 16 regression tests:
 * - five rotating FLUX art directions with guaranteed distinct variants,
 * - PNG/JPEG mime detection for embedded scene data URIs,
 * - auto-harvest search/benefit safety helpers,
 * - admin protection on the harvest write endpoint.
 */

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const JPEG_BASE64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////";

function testArtDirectionStyles() {
  assert.equal(
    ART_DIRECTION_STYLE_IDS.length,
    6,
    "Six art directions (Simple primary + five legacy) are required.",
  );
  assert.equal(new Set(ART_DIRECTION_STYLE_IDS).size, 6, "Style ids must be unique.");
  assert.equal(ART_DIRECTION_STYLE_IDS[0], "simple-botanical-horizon", "Simple must be the primary default.");
  assert.equal(DEFAULT_ART_DIRECTION_STYLE, "simple-botanical-horizon");

  for (const id of ART_DIRECTION_STYLE_IDS) {
    const style = ART_DIRECTION_STYLES[id];
    assert.ok(style, `Style ${id} must exist.`);
    assert.equal(style.id, id);
    assert.ok(style.labelAr.trim().length > 0, `Style ${id} needs an Arabic label.`);
    assert.ok(style.labelEn.trim().length > 0, `Style ${id} needs an English label.`);
    assert.ok(style.scenePrompt.length > 80, `Style ${id} prompt must be detailed.`);
    assert.ok(
      /no product|no bottle/i.test(style.scenePrompt),
      `Style ${id} must forbid the product in the scene prompt.`,
    );
    assert.ok(
      /no text/i.test(style.scenePrompt),
      `Style ${id} must forbid text in the scene prompt.`,
    );
    assert.ok(
      /9:16|vertical/i.test(style.scenePrompt),
      `Style ${id} must request a vertical 9:16 stage.`,
    );
  }

  const simple = ART_DIRECTION_STYLES["simple-botanical-horizon"];
  assert.equal(simple.template, "simple-botanical-horizon");
  assert.ok(/glossy reflective glass horizon floor/i.test(simple.scenePrompt));
  assert.ok(/volumetric clouds/i.test(simple.scenePrompt));
  assert.ok(/botanical leaves clustered at the center horizon floor/i.test(simple.scenePrompt));

  const freshPrompt = buildScenePrompt("simple-botanical-horizon", {
    category: "skincare",
    name: "غسول مرطب",
  });
  assert.ok(freshPrompt.includes("smooth monochrome sage-green wall"));
  assert.ok(freshPrompt.includes("fresh lush green mint and botanical leaves"));

  const luxuryPrompt = buildScenePrompt("simple-botanical-horizon", {
    category: "fragrance",
    name: "عطر عود",
  });
  assert.ok(luxuryPrompt.includes("smooth monochrome deep emerald-charcoal wall"));
  assert.ok(luxuryPrompt.includes("dark emerald botanical leaves"));

  const haircarePrompt = buildScenePrompt("simple-botanical-horizon", {
    category: "hair_care",
    name: "شامبو بالزيت",
  });
  assert.ok(haircarePrompt.includes("smooth monochrome warm golden sage-green wall"));

  const prompt = buildScenePrompt("luxury-amber-noir", {
    brand: "الرحمة",
    category: "fragrance",
    name: "عطر عود",
  });
  assert.ok(prompt.startsWith(ART_DIRECTION_STYLES["luxury-amber-noir"].scenePrompt));
  assert.ok(/luxury fragrance editorial/i.test(prompt), "Fragrance mood must be injected.");
}

function testStyleRotation() {
  const seen = new Set<string>();
  for (const seed of ["p1", "p2", "p3", "p4", "p5", "product-abc", "x"]) {
    const style = styleForSeed(seed);
    assert.ok(
      (ART_DIRECTION_STYLE_IDS as string[]).includes(style),
      `styleForSeed(${seed}) must return a known style.`,
    );
    assert.equal(style, styleForSeed(seed), "Style selection must be deterministic.");
    seen.add(style);
  }
  assert.ok(seen.size >= 2, "Different product seeds must rotate across styles.");

  for (const seed of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
    const [first, second] = variantStylePair(seed);
    assert.equal(first, "simple-botanical-horizon", "Variant 1 must always use Simple.");
    assert.notEqual(first, second, `Variants for ${seed} must use distinct art directions.`);
    assert.ok((ART_DIRECTION_STYLE_IDS as string[]).includes(first));
    assert.ok((ART_DIRECTION_STYLE_IDS as string[]).includes(second));
  }
}

function testMimeDetection() {
  assert.equal(detectBase64ImageMime(PNG_BASE64), "image/png");
  assert.equal(detectBase64ImageMime(JPEG_BASE64), "image/jpeg");
  assert.equal(detectBase64ImageMime("UklGRiQAAABXRUJQVlA4IBgAAAAw"), "image/webp");
}

async function testSceneGeneration() {
  const noAi = await generateArtDirectedScene({}, "aqua-splash-minimal", {
    category: "skincare",
  });
  assert.equal(noAi.image, null, "Without an AI binding the scene must fall back to vectors.");
  assert.equal(noAi.provider, "deterministic-studio");
  assert.ok(noAi.fallbackReason);

  const env = {
    AI: {
      run: async () => ({ image: PNG_BASE64 }),
    },
  } as unknown as SceneEnv;
  const flux = await generateArtDirectedScene(env, "botanical-terracotta", {
    category: "hair_care",
  });
  assert.equal(flux.provider, "cloudflare-ai");
  assert.equal(flux.styleId, "botanical-terracotta");
  assert.ok(flux.image?.startsWith("data:image/png;base64,"), "FLUX scenes embed a PNG data URI.");
  assert.equal(flux.model, "@cf/black-forest-labs/flux-1-schnell");
}

function testHarvestHelpers() {
  const query = buildHarvestQuery({
    brand_arabic: "فاتيكا",
    brand_english: "Vatika",
    name_arabic: "شامبو",
    name_english: "Shampoo",
    category: "shampoo",
  });
  assert.ok(query.includes("فاتيكا"));
  assert.ok(query.includes("شامبو"));
  assert.ok(query.includes("صورة المنتج مصر"));
  assert.equal(
    query,
    buildHarvestQuery({
      brand_arabic: "فاتيكا",
      brand_english: "Vatika",
      name_arabic: "شامبو",
      name_english: "Shampoo",
      category: "shampoo",
    }),
    "Harvest query must be deterministic.",
  );

  assert.equal(inferCategory({ name_arabic: "عطر عود فاخر" }), "fragrance");
  assert.equal(inferCategory({ name_arabic: "شامبو للشعر" }), "shampoo");
  assert.equal(inferCategory({ name_arabic: "كريم ترطيب للبشرة" }), "skincare");
  assert.equal(inferCategory({ name_arabic: "منتج غامض", category: "hair_mask" }), "hair_mask");

  assert.equal(isForbiddenClaim("خصم 30% على المنتج"), true);
  assert.equal(isForbiddenClaim("سعر خاص اليوم"), true);
  assert.equal(isForbiddenClaim("شحن مجاني"), true);
  assert.equal(isForbiddenClaim("يعالج تساقط الشعر"), true);
  assert.equal(isForbiddenClaim("عناية يومية بالشعر"), false);

  const sanitized = sanitizeBenefitLines(
    [
      "خصم 50% لفترة محدودة",
      "مرطب يومي للبشرة الجافة جداً",
      "English only benefit line",
      "قناع شعر مغذي للشعر التالف",
      "عناية يومية بالشعر",
    ],
    ["ضمن روتين العناية اليومي", "ملمس ناعم وسهل التسريح", "اختيار موثوق للعناية اليومية"],
  );
  assert.equal(sanitized.length, 3, "Sanitizer must always return exactly three lines.");
  for (const line of sanitized) {
    assert.equal(isForbiddenClaim(line), false, `Forbidden claim leaked: ${line}`);
    assert.ok(/[\u0600-\u06FF]/.test(line), `Line must be Arabic: ${line}`);
    const words = line.split(/\s+/).filter(Boolean).length;
    assert.ok(words >= 4 && words <= 8, `Line must be 4-8 words: ${line}`);
  }
  assert.equal(new Set(sanitized).size, 3, "Benefit lines must be unique.");

  const images = extractPageImages(
    `<html><head>
       <meta property="og:image" content="/uploads/packshot.png" />
       <meta name="twitter:image" content="https://cdn.example.com/twitter.webp" />
       <meta property="og:image" content="https://cdn.example.com/dup.png" />
       <meta property="og:image" content="https://cdn.example.com/dup.png" />
     </head></html>`,
    "https://shop.example.com/product/42",
  );
  assert.deepEqual(images, [
    "https://shop.example.com/uploads/packshot.png",
    "https://cdn.example.com/twitter.webp",
    "https://cdn.example.com/dup.png",
  ]);
}

function harvestDatabase(rows: unknown[]) {
  const calls: { sql: string; values: unknown[] }[] = [];
  const db = {
    prepare(sql: string) {
      const statement = {
        values: [] as unknown[],
        bind(...values: unknown[]) {
          statement.values = values;
          return statement;
        },
        async all() {
          calls.push({ sql, values: statement.values });
          return { results: rows };
        },
        async run() {
          calls.push({ sql, values: statement.values });
          return { success: true };
        },
        async first() {
          return null;
        },
      };
      return statement;
    },
  };
  return { db, calls };
}

async function testHarvestSelection() {
  const { db, calls } = harvestDatabase([]);
  const outcome = await harvestRandomProducts(
    { DB: db as unknown as D1Database } as HarvestEnv,
    5,
  );
  assert.deepEqual(outcome, { harvested: [], skipped: [] });

  const select = calls.find((call) => call.sql.includes("FROM products p"));
  assert.ok(select, "Harvest must query unverified products.");
  assert.ok(select.sql.includes("ORDER BY RANDOM()"), "Harvest must pick random products.");
  assert.ok(
    select.sql.includes("verification_status = 'needs_verification'"),
    "Harvest must only target products needing verification.",
  );
  assert.ok(select.sql.includes("LIMIT ?"), "Harvest limit must be parameterized.");
  assert.deepEqual(select.values, [5]);

  const response = await postHarvestRandom({
    request: new Request("https://example.test/api/ai/harvest-random", {
      method: "POST",
      body: JSON.stringify({ count: 0 }),
    }),
    env: { DB: db as unknown as D1Database },
  } as unknown as Parameters<typeof postHarvestRandom>[0]);
  assert.equal(response.status, 400, "count must be clamped to 1-5.");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
}

function testAdminProtection() {
  const harvestPost = new Request("https://example.test/api/ai/harvest-random", {
    method: "POST",
  });
  const harvestGet = new Request("https://example.test/api/ai/harvest-random");
  const dbPost = new Request("https://example.test/api/db/products", { method: "POST" });
  const scenePost = new Request("https://example.test/api/ai/studio-scene", { method: "POST" });

  assert.equal(isProtectedRequest(harvestPost), true, "Harvest must require the admin key.");
  assert.equal(isProtectedRequest(harvestGet), false, "Harvest reads are not defined.");
  assert.equal(isProtectedRequest(dbPost), true);
  assert.equal(isProtectedRequest(scenePost), false, "Scene reads need no admin key.");
}

async function run() {
  testArtDirectionStyles();
  testStyleRotation();
  testMimeDetection();
  await testSceneGeneration();
  testHarvestHelpers();
  await testHarvestSelection();
  testAdminProtection();

  console.log(
    "Phase 16 tests passed: Simple primary art direction + five legacy styles, distinct variant styles, colour-adapted FLUX prompts, data URIs, mime detection, harvest safety filters, random selection, and admin protection.",
  );
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
