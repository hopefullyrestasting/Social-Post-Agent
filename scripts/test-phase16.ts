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
 * Regression tests for the three rotating luxury art directions, scene/composite
 * behavior, harvest safety helpers, and admin protection.
 */

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const JPEG_BASE64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////";

function testArtDirectionStyles() {
  assert.deepEqual(
    ART_DIRECTION_STYLE_IDS,
    [
      "coastal-sunlit-stone-caustics",
      "botanical-horizon-reflection",
      "noir-basalt-golden-rim",
      "architectural-brand-frame",
    ],
    "Exactly the four rotating luxury art directions must be configured.",
  );
  assert.equal(new Set(ART_DIRECTION_STYLE_IDS).size, 4, "Style ids must be unique.");
  assert.equal(DEFAULT_ART_DIRECTION_STYLE, "coastal-sunlit-stone-caustics");

  for (const id of ART_DIRECTION_STYLE_IDS) {
    const style = ART_DIRECTION_STYLES[id];
    assert.ok(style, `Style ${id} must exist.`);
    assert.equal(style.id, id);
    assert.ok(style.labelAr.trim().length > 0, `Style ${id} needs an Arabic label.`);
    assert.ok(style.labelEn.trim().length > 0, `Style ${id} needs an English label.`);
    assert.ok(style.scenePrompt.length > 80, `Style ${id} prompt must be detailed.`);
    assert.ok(/no product|no bottle/i.test(style.scenePrompt), `Style ${id} must forbid the product.`);
    assert.ok(/no text/i.test(style.scenePrompt), `Style ${id} must forbid text.`);
    assert.ok(/9:16/i.test(style.scenePrompt), `Style ${id} must request a vertical 9:16 stage.`);
    assert.ok(/upper 35%/i.test(style.scenePrompt), `Style ${id} must keep the upper 35% clean for headline.`);
    assert.ok(/bottom 12%/i.test(style.scenePrompt), `Style ${id} must keep the bottom 12% darker for contact.`);
  }

  const coastal = ART_DIRECTION_STYLES["coastal-sunlit-stone-caustics"];
  assert.equal(coastal.template, "botanical-arch-frame");
  assert.ok(/coastal sandstone|limestone/i.test(coastal.scenePrompt));
  assert.ok(/golden-hour/i.test(coastal.scenePrompt));
  assert.ok(/caustic/i.test(coastal.scenePrompt));
  assert.ok(/mediterranean sea/i.test(coastal.scenePrompt));
  assert.ok(/85mm f\/1\.8/i.test(coastal.scenePrompt));

  const botanical = ART_DIRECTION_STYLES["botanical-horizon-reflection"];
  assert.equal(botanical.template, "simple-botanical-horizon");
  assert.ok(/glossy mirror floor/i.test(botanical.scenePrompt));
  assert.ok(/mint and botanical leaves/i.test(botanical.scenePrompt));
  assert.ok(/soft floating clouds/i.test(botanical.scenePrompt));

  const noir = ART_DIRECTION_STYLES["noir-basalt-golden-rim"];
  assert.equal(noir.template, "editorial-beauty-card");
  assert.ok(/dark architectural basalt/i.test(noir.scenePrompt));
  assert.ok(/golden-amber rim light/i.test(noir.scenePrompt));
  assert.ok(/atmospheric mist|glow/i.test(noir.scenePrompt));

  const adapted = buildScenePrompt("botanical-horizon-reflection", {
    category: "fragrance",
    name: "عطر عود",
  });
  assert.ok(/monochrome .* wall/i.test(adapted), "Botanical wall must be color-adapted to product mood.");
  assert.ok(/luxury fragrance editorial/i.test(adapted), "Fragrance mood must be injected.");

  // Background-only contract: prompts forbid the product and never ask to preserve it.
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
    assert.equal(/preserve the original product|reference image/i.test(prompt), false);
  }
}

function testStyleRotation() {
  const seen = new Set<string>();
  for (const seed of ["p1", "p2", "p3", "p4", "p5", "product-abc", "x"]) {
    const style = styleForSeed(seed);
    assert.ok((ART_DIRECTION_STYLE_IDS as string[]).includes(style), `styleForSeed(${seed}) must return a known style.`);
    assert.equal(style, styleForSeed(seed), "Style selection must be deterministic.");
    seen.add(style);
  }
  assert.ok(seen.size === 3, "Seeds must rotate across all three styles over a small sample.");

  for (const seed of ["a", "b", "c", "d", "e", "f", "g", "h", "product-123"]) {
    const [first, second] = variantStylePair(seed);
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
  const noAi = await generateArtDirectedScene({}, "botanical-horizon-reflection", {
    category: "skincare",
  });
  assert.equal(noAi.provider, "deterministic-studio");
  assert.ok(noAi.image?.startsWith("data:image/svg+xml"), "Deterministic fallback must return an inline SVG scene.");
  assert.ok(noAi.fallbackReason);

  const env = {
    AI: {
      run: async () => ({ image: PNG_BASE64 }),
    },
  } as unknown as SceneEnv;
  const flux = await generateArtDirectedScene(env, "noir-basalt-golden-rim", {
    category: "hair_care",
  });
  assert.equal(flux.provider, "cloudflare-ai");
  assert.equal(flux.styleId, "noir-basalt-golden-rim");
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
    ["ضمن روتين العناية اليومية", "ملمس ناعم وسهل التسريح", "اختيار موثوق للعناية اليومية"],
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
  const outcome = await harvestRandomProducts({ DB: db as unknown as D1Database } as HarvestEnv, 5);
  assert.deepEqual(outcome, { harvested: [], skipped: [] });

  const select = calls.find((call) => call.sql.includes("FROM products p"));
  assert.ok(select, "Harvest must query unverified products.");
  assert.ok(select.sql.includes("ORDER BY RANDOM()"), "Harvest must pick random products.");
  assert.ok(select.sql.includes("verification_status = 'needs_verification'"), "Harvest must only target products needing verification.");
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
  const harvestPost = new Request("https://example.test/api/ai/harvest-random", { method: "POST" });
  const harvestGet = new Request("https://example.test/api/ai/harvest-random");
  const dbPost = new Request("https://example.test/api/db/products", { method: "POST" });
  const scenePost = new Request("https://example.test/api/ai/studio-scene", { method: "POST" });

  assert.equal(isProtectedRequest(harvestPost), true, "Harvest must require the admin key.");
  assert.equal(isProtectedRequest(harvestGet), false, "Harvest reads are not defined.");
  assert.equal(isProtectedRequest(dbPost), true);
  assert.equal(isProtectedRequest(scenePost), false, "Scene reads need no admin key.");
}

async function testBackgroundOnlyNanoBanana() {
  const offline = await generateBackgroundWithNanoBananaDetailed({}, "simple-botanical-horizon", {
    category: "skincare",
  });
  assert.equal(offline.provider, "studio-fallback");
  assert.equal(offline.image, null);

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

  const coastalPrompt = buildProductCompositePrompt({
    styleId: "coastal-sunlit-stone-caustics",
    context: { category: "perfume", name: "عطر منعش", brand: "عساف" },
  });
  assert.match(coastalPrompt, /Commercial luxury product photography/i);
  assert.match(coastalPrompt, /reference image/i);
  assert.match(coastalPrompt, /Strictly preserve the exact bottle shape/i);
  assert.match(coastalPrompt, /upper 35%.*clean, open, and softly lit/i);
  assert.match(coastalPrompt, /bottom 12%.*darker/i);
  assert.match(coastalPrompt, /sun-drenched rough coastal sandstone/i);
  assert.match(coastalPrompt, /deep blue Mediterranean sea/i);
  assert.match(coastalPrompt, /No generated text, no watermarks, no extra bottles/i);

  const botanicalPrompt = buildProductCompositePrompt({
    styleId: "botanical-horizon-reflection",
    context: { category: "skincare", name: "كريم", brand: "إيفا" },
  });
  assert.match(botanicalPrompt, /glossy mirror floor/i);
  assert.match(botanicalPrompt, /fresh mint and botanical leaves/i);
  assert.match(botanicalPrompt, /soft floating clouds/i);

  const noirPrompt = buildProductCompositePrompt({
    styleId: "noir-basalt-golden-rim",
    context: { category: "perfume", name: "عود", brand: "خامرية" },
  });
  assert.match(noirPrompt, /dark architectural basalt stone slab/i);
  assert.match(noirPrompt, /warm golden-amber rim light/i);

  const offline = await compositeProductScene({}, reference, { category: "skincare" });
  assert.equal(offline.provider, "unavailable");
  assert.equal(offline.image, null);
  assert.equal(offline.usedReference, false);
  assert.equal(offline.aiComposite, false);
  assert.equal(offline.containsProduct, false);
  assert.ok(offline.fallbackReason);

  const loaded = await loadReferenceImage(reference);
  assert.ok(loaded && loaded.bytes.length > 0, "Data URI reference must decode to bytes.");
  assert.equal(loaded?.mime, "image/png");
  assert.equal(await loadReferenceImage("http://127.0.0.1/private-packshot.png"), null, "Private/local reference hosts must be blocked.");

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
      { styleId: "coastal-sunlit-stone-caustics" },
    );
    assert.equal(gemini.provider, "gemini-image-edit");
    assert.equal(gemini.model, "gemini-2.5-flash-image");
    assert.equal(gemini.usedReference, true);
    assert.equal(gemini.aiComposite, true);
    assert.equal(gemini.containsProduct, true);
    assert.ok(String(gemini.image).startsWith("data:image/png;base64,"));
    assert.match(sentUrl, /gemini-2\.5-flash-image/);
    assert.equal(sentBody.includes(PNG_BASE64), true, "The authentic packshot must be sent as reference.");
    assert.match(sentBody, /Strictly preserve the exact bottle shape/i);
  } finally {
    globalThis.fetch = originalFetch;
  }

  const aiCalls: { model: string; input: Record<string, unknown> }[] = [];
  let multipartText = "";
  const workers = await compositeProductScene(
    {
      AI: {
        run: async (model: string, input: Record<string, unknown>) => {
          aiCalls.push({ model, input });
          const multipart = input.multipart as { body?: ReadableStream; contentType?: string } | undefined;
          if (multipart?.body) {
            multipartText = await new Response(multipart.body).text();
          }
          return { image: PNG_BASE64 };
        },
      },
    },
    reference,
    { category: "skincare" },
    { styleId: "botanical-horizon-reflection" },
  );
  assert.equal(workers.provider, "workers-ai-img2img");
  assert.equal(workers.model, "@cf/black-forest-labs/flux-2-klein-4b");
  assert.equal(workers.usedReference, true);
  assert.equal(aiCalls[0].model, "@cf/black-forest-labs/flux-2-klein-4b");
  assert.match(multipartText, /name="input_image_0"; filename="authentic-packshot\.png"/);
  assert.match(multipartText, /name="prompt"/);
  assert.match(multipartText, /Strictly preserve the exact bottle shape/i);
  assert.match(multipartText, /upper 35%/i);
  assert.match(multipartText, /bottom 12%/i);
  assert.match(multipartText, /name="width"\r\n\r\n768/);
  assert.match(multipartText, /name="height"\r\n\r\n1344/);
  assert.ok(String(workers.image).startsWith("data:image/png;base64,"));

  const retryCalls: { model: string }[] = [];
  const retried = await compositeProductScene(
    {
      AI: {
        run: async (model: string) => {
          retryCalls.push({ model });
          if (model === "@cf/black-forest-labs/flux-2-klein-4b") {
            throw new Error("edit model unavailable");
          }
          return { image: PNG_BASE64 };
        },
      },
    },
    reference,
    { category: "skincare" },
    { styleId: "noir-basalt-golden-rim" },
  );
  assert.equal(retried.provider, "workers-ai-img2img");
  assert.equal(retried.model, "@cf/black-forest-labs/flux-2-klein-9b");
  assert.equal(retried.usedReference, true);
  assert.ok(retryCalls.some((call) => call.model === "@cf/black-forest-labs/flux-2-klein-9b"));

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
      body: JSON.stringify({ imageUrl: reference, styleId: "coastal-sunlit-stone-caustics" }),
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
    "Phase 16 tests passed: 4 rotating luxury art directions (Coastal Sunlit Stone & Caustics, Botanical Horizon Reflection, Noir Basalt & Golden Rim-Light), distinct variant pairs, color-adapted prompts, deterministic inline fallbacks, background-only Nano Banana, reference-conditioned product compositing (Gemini/HF/Workers AI klein with timeout-safe retries), harvest safety, and admin protection.",
  );
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
