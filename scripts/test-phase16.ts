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
import {
  buildBackgroundPrompt,
  generateBackgroundWithNanoBananaDetailed,
  onRequestPost as postNanoBananaStage,
} from "../functions/api/ai/nano-banana-stage";
import {
  buildProductCompositePrompt,
  compositeProductScene,
  loadReferenceImage,
  onRequestPost as postProductComposite,
} from "../functions/api/ai/product-composite";

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

  // Background-only contract: these prompts forbid the product and never ask to
  // preserve it. Reference-conditioned compositing (rule #4) is covered below.
  for (const template of [
    "simple-botanical-horizon",
    "silver-podium-botanical",
    "botanical-arch-frame",
    "editorial-beauty-card",
  ] as const) {
    const prompt = buildBackgroundPrompt({ category: "haircare", name: "شامبو" }, template);
    assert.ok(/no product/i.test(prompt), `Nano Banana ${template} must forbid the product.`);
    assert.ok(/no bottle/i.test(prompt), `Nano Banana ${template} must forbid the bottle.`);
    assert.ok(/no packaging/i.test(prompt), `Nano Banana ${template} must forbid packaging.`);
    assert.ok(/no text|no letters/i.test(prompt), `Nano Banana ${template} must forbid text.`);
    assert.ok(/9:16/i.test(prompt), `Nano Banana ${template} must request a vertical plate.`);
    assert.equal(
      /preserve the original product|reference image/i.test(prompt),
      false,
      `Nano Banana ${template} must never ask the model to recreate packaging.`,
    );
  }

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

async function testBackgroundOnlyNanoBanana() {
  // No key -> graceful fallback, never an attempt to draw the product.
  const offline = await generateBackgroundWithNanoBananaDetailed({}, "simple-botanical-horizon", {
    category: "skincare",
  });
  assert.equal(offline.provider, "studio-fallback");
  assert.equal(offline.image, null);

  // The HTTP endpoint rejects product images outright.
  const rejected = await postNanoBananaStage({
    request: new Request("https://example.test/api/ai/nano-banana-stage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl: "https://example.test/packshot.png" }),
    }),
    env: {},
  } as any);
  assert.equal(rejected.status, 400);
  const body = (await rejected.json()) as Record<string, unknown>;
  assert.match(String(body.error), /Background-only/i);

  // Text-to-image request carries no inline product image.
  const originalFetch = globalThis.fetch;
  let sentBody = "";
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    sentBody = String(init?.body ?? "");
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { mimeType: "image/png", data: "AAAA" } }],
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const generated = await generateBackgroundWithNanoBananaDetailed(
      { GEMINI_API_KEY: "test-key" },
      "simple-botanical-horizon",
      { category: "skincare" },
    );
    assert.equal(generated.provider, "nano-banana");
    assert.ok(String(generated.image).startsWith("data:image/png;base64,"));
    assert.equal(/inline_data|inlineData/.test(sentBody), false, "No product image may be sent to the image model.");
    assert.match(sentBody, /no product/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function testProductComposite() {
  const reference = `data:image/png;base64,${PNG_BASE64}`;

  // Prompt contract: reference-conditioned, preserve the label, 9:16 guide with
  // real shadows/reflections, and absolutely no new text or packaging redraw.
  const prompt = buildProductCompositePrompt({
    styleId: "simple-botanical-horizon",
    context: { category: "haircare", name: "شامبو" },
  });
  assert.match(prompt, /image-to-image/i);
  assert.match(prompt, /attached image is the ONLY authentic reference/i);
  assert.match(prompt, /Preserve the product exactly/i);
  assert.match(prompt, /every Arabic and Latin letter of the label/i);
  assert.match(prompt, /Never redraw, reletter, translate/i);
  assert.match(prompt, /1080x1920/i);
  assert.match(prompt, /9:16/i);
  assert.match(prompt, /contact shadow/i);
  assert.match(prompt, /mirror reflection/i);
  assert.match(prompt, /volumetric smoke or mist/i);
  assert.match(prompt, /Do not add any new text or typography/i);
  assert.match(prompt, /no duplicates/i);
  assert.equal(
    /no product|no bottle|no packaging/i.test(prompt),
    false,
    "The composite prompt includes the product (unlike background-only prompts).",
  );

  // No provider configured -> graceful fallback, no reference leaves the app.
  const offline = await compositeProductScene({}, reference, { category: "skincare" });
  assert.equal(offline.provider, "unavailable");
  assert.equal(offline.image, null);
  assert.equal(offline.usedReference, false);
  assert.equal(offline.aiComposite, false);
  assert.equal(offline.containsProduct, false);
  assert.ok(offline.fallbackReason);

  // Reference resolution: data URIs parse, private hosts are rejected.
  const loaded = await loadReferenceImage(reference);
  assert.ok(loaded && loaded.bytes.length > 0, "Data URI reference must decode to bytes.");
  assert.equal(loaded?.mime, "image/png");
  assert.equal(
    await loadReferenceImage("http://127.0.0.1/private-packshot.png"),
    null,
    "Private/local reference hosts must be blocked.",
  );

  // Gemini image editing receives the authentic packshot as inline conditioning.
  const originalFetch = globalThis.fetch;
  let sentUrl = "";
  let sentBody = "";
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    sentUrl = String(input);
    sentBody = String(init?.body ?? "");
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { mimeType: "image/png", data: "Z2VuaW1n" } }],
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const gemini = await compositeProductScene(
      { GEMINI_API_KEY: "test-key" },
      reference,
      { category: "haircare" },
    );
    assert.equal(gemini.provider, "gemini-image-edit");
    assert.equal(gemini.model, "gemini-2.5-flash-image");
    assert.equal(gemini.usedReference, true);
    assert.equal(gemini.aiComposite, true);
    assert.equal(gemini.containsProduct, true);
    assert.ok(String(gemini.image).startsWith("data:image/png;base64,"));
    assert.match(sentUrl, /gemini-2\.5-flash-image/);
    assert.equal(
      sentBody.includes(PNG_BASE64),
      true,
      "The authentic packshot must be sent to the model as the reference.",
    );
    assert.match(sentBody, /Preserve the product exactly/i);
  } finally {
    globalThis.fetch = originalFetch;
  }

  // Workers AI zero-key fallback: stable-diffusion-v1-5-img2img with the cutout.
  const aiCalls: { model: string; input: Record<string, unknown> }[] = [];
  const workers = await compositeProductScene(
    {
      AI: {
        run: async (model: string, input: Record<string, unknown>) => {
          aiCalls.push({ model, input });
          return { image: PNG_BASE64 };
        },
      },
    },
    reference,
    { category: "skincare" },
    { styleId: "modern-clinical-glow" },
  );
  assert.equal(workers.provider, "workers-ai-img2img");
  assert.equal(workers.model, "@cf/stabilityai/stable-diffusion-xl-base-1.0");
  assert.equal(workers.usedReference, true);
  assert.equal(aiCalls[0].model, "@cf/stabilityai/stable-diffusion-xl-base-1.0");
  assert.equal(
    aiCalls[0].input.image_b64,
    PNG_BASE64,
    "img2img must receive the authentic cutout as image_b64.",
  );
  assert.equal(aiCalls[0].input.strength, 0.45);
  assert.equal(aiCalls[0].input.width, 720);
  assert.equal(aiCalls[0].input.height, 1280);
  assert.match(String(aiCalls[0].input.prompt), /Preserve the product exactly/i);
  assert.ok(String(workers.image).startsWith("data:image/png;base64,"));

  // HTTP endpoint validation + graceful 502 fallback.
  const missing = await postProductComposite({
    request: new Request("https://example.test/api/ai/product-composite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }),
    env: {},
  } as any);
  assert.equal(missing.status, 400);

  const unavailable = await postProductComposite({
    request: new Request("https://example.test/api/ai/product-composite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl: reference, styleId: "simple-botanical-horizon" }),
    }),
    env: {},
  } as any);
  assert.equal(unavailable.status, 502);
  const unavailableBody = (await unavailable.json()) as Record<string, unknown>;
  assert.equal(unavailableBody.fallback, true);
  assert.equal(unavailableBody.provider, "unavailable");
}

async function run() {
  testArtDirectionStyles();
  testStyleRotation();
  testMimeDetection();
  await testSceneGeneration();
  await testBackgroundOnlyNanoBanana();
  await testProductComposite();
  testHarvestHelpers();
  await testHarvestSelection();
  testAdminProtection();

  console.log(
    "Phase 16 tests passed: Simple primary art direction + five legacy styles, distinct variant styles, colour-adapted FLUX prompts, background-only Nano Banana plates (no packaging redraw), reference-conditioned product compositing (Gemini edit / Hugging Face / Workers AI img2img with label preservation and graceful fallback), data URIs, mime detection, harvest safety filters, random selection, and admin protection.",
  );
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
