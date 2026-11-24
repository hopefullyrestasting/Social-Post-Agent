/**
 * Basic Studio contract tests.
 *
 * Covers the simplified iDesign studio flow end to end with a MockDB:
 * - sequential, non-repeating D1-backed generation (including reload persistence)
 * - exactly two creatives per product
 * - automatic count and explicit product selection
 * - 409 rejection when an explicit selection contains an already-generated id
 * - optional price/offer/sales-line metadata with no quality-gate weakening
 * - centralised iDesign branding/links and the six-language switcher contract
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { onRequestPost as runCampaign } from "../functions/api/db/campaigns/run";
import {
  IDESIGN_STUDIO_CONFIG,
  AL_RAHMA_BRAND_CONFIG,
} from "../src/lib/al-rahma/brand-core";
import {
  buildDesignPromptBlock,
  commercialBadgeAnchors,
  CREATIVE_SLOT_RECIPES,
  DESIGN_RULE_IDS,
  DESIGN_RULES,
  creativeSlotRecipe,
  headlinePlanForSlot,
} from "../src/lib/al-rahma/design-library";
import { OverlaySystem } from "../src/lib/al-rahma/overlay-system";
import { ProductionEngine } from "../src/lib/al-rahma/production-engine";
import { LANGUAGES, I18N, languageDirection, translate } from "../src/lib/al-rahma/i18n";
import {
  buildStudioSalesLine,
  isSafeOfferText,
  isSafeSalesLine,
  sanitizeOfferText,
} from "../src/lib/al-rahma/studio-fields";

type BoundValue = string | number | null;
type Call = { sql: string; values: BoundValue[] };

interface ProductRow {
  id: string;
  name_arabic: string;
  name_english: string | null;
  category: string;
  verification_status: string;
  warehouse_stock_status: string;
  last_advertised_at: number | null;
  description: string | null;
  price: number | null;
  image_url: string | null;
  image_source: string | null;
  brand_arabic: string;
  brand_slug: string;
  created_at: number;
}

class StudioStatement {
  values: BoundValue[] = [];

  constructor(
    readonly sql: string,
    private readonly db: StudioDatabase,
  ) {}

  bind(...values: BoundValue[]) {
    this.values = values;
    return this;
  }

  async first<T>(): Promise<T | null> {
    this.db.calls.push({ sql: this.sql, values: this.values });
    return null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    this.db.calls.push({ sql: this.sql, values: this.values });

    if (this.sql.includes("FROM products p") && this.sql.includes("JOIN product_assets pa")) {
      const requested = Number(this.values[this.values.length - 1] ?? 0);
      const explicitIds = this.sql.includes("p.id IN (")
        ? this.values.slice(0, this.values.length).filter((value) => typeof value === "string")
        : [];

      const rows = explicitIds.length > 0
        ? explicitIds
            .map((id) => this.db.products.find((product) => product.id === id))
            .filter((product): product is ProductRow => Boolean(product))
        : this.db.products
            .filter((product) => product.last_advertised_at == null)
            .slice()
            .sort((a, b) => a.created_at - b.created_at || a.id.localeCompare(b.id))
            .slice(0, requested);

      return { results: rows as unknown as T[] };
    }

    if (this.sql.includes("FROM business_settings WHERE key IN (")) {
      const results = this.values
        .filter((key): key is string => typeof key === "string")
        .map((key) => ({ key, value: this.db.offers.get(key) ?? null }));
      return { results: results as unknown as T[] };
    }

    return { results: [] };
  }

  async run(): Promise<{ success: boolean }> {
    this.db.calls.push({ sql: this.sql, values: this.values });
    return { success: true };
  }
}

class StudioDatabase {
  calls: Call[] = [];
  products: ProductRow[] = [];
  offers = new Map<string, string>();

  prepare(sql: string) {
    return new StudioStatement(sql, this);
  }

  async batch(statements: StudioStatement[]) {
    for (const statement of statements) {
      this.calls.push({ sql: statement.sql, values: statement.values });
      // Simulate the persisted D1 lease marker used for reload persistence.
      if (statement.sql.includes("UPDATE products SET last_advertised_at")) {
        const id = String(statement.values[2] ?? "");
        const product = this.products.find((item) => item.id === id);
        if (product) product.last_advertised_at = Number(statement.values[0] ?? Date.now());
      }
    }
    return statements.map(() => ({ success: true }));
  }
}

function makeProduct(id: string, createdAt: number, overrides: Partial<ProductRow> = {}): ProductRow {
  return {
    id,
    name_arabic: `منتج ${id}`,
    name_english: null,
    category: "hair_care",
    verification_status: "verified",
    warehouse_stock_status: "in_stock",
    last_advertised_at: null,
    description: null,
    price: null,
    image_url: "https://example.test/packshot.png",
    image_source: "https://example.test/source",
    brand_arabic: "علامة موثّقة",
    brand_slug: "verified-brand",
    created_at: createdAt,
    ...overrides,
  };
}

function studioDb(count = 7): StudioDatabase {
  const db = new StudioDatabase();
  db.products = Array.from({ length: count }, (_, index) =>
    makeProduct(`p-${index + 1}`, index + 1),
  );
  return db;
}

function context(db: StudioDatabase, payload: Record<string, unknown>) {
  return {
    request: new Request("https://example.test/api/db/campaigns/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
    env: { DB: db as unknown as D1Database },
  } as unknown as Parameters<typeof runCampaign>[0];
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function assertBasicEnvelope(body: Record<string, unknown>) {
  assert.equal(body.success, true, JSON.stringify(body));
  assert.ok(body.campaign && typeof body.campaign === "object", "campaign is required");
  assert.ok(Array.isArray(body.creatives), "creatives array is required");
  assert.ok(Array.isArray(body.selected_product_ids), "selected_product_ids is required");
  assert.ok(typeof body.image_url === "string", "image_url is required");
}

async function testSequentialNonRepeatingBatches() {
  const db = studioDb(7);

  const firstResponse = await runCampaign(context(db, { mode: "basic", count: 5 }));
  const first = await json(firstResponse);
  assert.equal(firstResponse.status, 200);
  assertBasicEnvelope(first);
  const firstIds = first.selected_product_ids as string[];
  assert.deepEqual(firstIds, ["p-1", "p-2", "p-3", "p-4", "p-5"]);
  assert.equal((first.creatives as unknown[]).length, 10, "5 products x 2 designs");

  const genCounts = new Map<string, number>();
  const creativesByProduct = new Map<string, Record<string, unknown>[]>();
  for (const creative of first.creatives as Record<string, unknown>[]) {
    const id = String(creative.product_id);
    genCounts.set(id, (genCounts.get(id) ?? 0) + 1);
    const list = creativesByProduct.get(id) ?? [];
    list.push(creative);
    creativesByProduct.set(id, list);
    assert.equal(typeof creative.image_url, "string");
    assert.equal(typeof creative.svg, "string");
  }
  for (const id of firstIds) {
    assert.equal(genCounts.get(id), 2, "exactly two creatives per product");
    const pair = creativesByProduct.get(id) ?? [];
    assert.deepEqual(
      pair.map((creative) => creative.design_slot).sort(),
      [1, 2],
      "each product must receive both distinct design slots",
    );
    assert.equal(
      new Set(pair.map((creative) => creative.design_recipe_id)).size,
      2,
      "each product must receive two distinct creative recipes",
    );
  }

  // Reload: the same request must continue the queue, never reselect products.
  db.calls = [];
  const secondResponse = await runCampaign(context(db, { mode: "basic", count: 5 }));
  const second = await json(secondResponse);
  assertBasicEnvelope(second);
  const secondIds = second.selected_product_ids as string[];
  assert.deepEqual(secondIds, ["p-6", "p-7"]);
  assert.equal((second.creatives as unknown[]).length, 4);
  for (const id of secondIds) assert.equal(firstIds.includes(id), false, "no repeats across reload");

  const selectSql = db.calls.find(
    (call) => call.sql.includes("FROM products p") && call.sql.includes("JOIN product_assets pa"),
  );
  assert.ok(selectSql, "sequential selection query must run");
  assert.ok(selectSql.sql.includes("p.last_advertised_at IS NULL"));
  assert.ok(selectSql.sql.includes("ORDER BY p.created_at ASC, p.id ASC"));
  assert.equal(selectSql.sql.includes("ORDER BY RANDOM()"), false);

  // A third run has nothing left: a tracked empty campaign, never recycled ids.
  const thirdResponse = await runCampaign(context(db, { mode: "basic", count: 5 }));
  const third = await json(thirdResponse);
  assert.equal(thirdResponse.status, 200);
  assert.equal((third.creatives as unknown[]).length, 0);
  const campaign = third.campaign as { status: string };
  assert.equal(campaign.status, "empty");
}

async function testSingleProductAndCustomSelection() {
  const db = studioDb(4);

  const singleResponse = await runCampaign(context(db, { mode: "basic", productIds: ["p-3"] }));
  const single = await json(singleResponse);
  assertBasicEnvelope(single);
  assert.deepEqual(single.selected_product_ids, ["p-3"]);
  assert.equal((single.creatives as unknown[]).length, 2, "single product => exactly 2 creatives");

  const customDb = studioDb(4);
  const customResponse = await runCampaign(context(customDb, { mode: "basic", count: 2 }));
  const custom = await json(customResponse);
  assertBasicEnvelope(custom);
  assert.deepEqual(custom.selected_product_ids, ["p-1", "p-2"]);
  assert.equal((custom.creatives as unknown[]).length, 4);

  const validation = await runCampaign(context(studioDb(2), { mode: "basic", count: 0 }));
  assert.equal(validation.status, 400, "count is clamped to 1..100 by the schema");

  const tooMany = await runCampaign(
    context(studioDb(2), { mode: "basic", productIds: Array.from({ length: 101 }, (_, i) => `p-${i}`) }),
  );
  assert.equal(tooMany.status, 400, "explicit selection is capped at 100 ids");
}

async function testAlreadyGeneratedSelection() {
  const db = studioDb(3);
  const first = await json(await runCampaign(context(db, { mode: "basic", productIds: ["p-1"] })));
  assertBasicEnvelope(first);

  const response = await runCampaign(
    context(db, { mode: "basic", productIds: ["p-2", "p-1"] }),
  );
  const body = await json(response);
  assert.equal(response.status, 409);
  assert.equal(body.success, false);
  assert.equal(body.code, "already_generated");
  assert.deepEqual(body.productIds, ["p-1"]);
}

function testDesignLibraryContract() {
  assert.deepEqual(DESIGN_RULE_IDS, [
    "product-hero-dominance",
    "clean-negative-space",
    "conditional-commercial-integrity",
    "lighting-context-harmony",
  ]);
  assert.deepEqual(
    DESIGN_RULE_IDS.map((id) => DESIGN_RULES[id].order),
    [1, 2, 3, 4],
    "Visual Hierarchy & Balance Rules must be numbered 1-4.",
  );
  for (const id of DESIGN_RULE_IDS) {
    assert.ok(DESIGN_RULES[id].titleAr, `${id} needs an Arabic title`);
    assert.ok(DESIGN_RULES[id].principle, `${id} needs a human-readable principle`);
    assert.ok(DESIGN_RULES[id].promptDirective, `${id} needs a prompt directive`);
    assert.ok(DESIGN_RULES[id].layoutDirective, `${id} needs a layout directive`);
  }
  assert.equal(new Set(Object.values(CREATIVE_SLOT_RECIPES).map((recipe) => recipe.id)).size, 2);
  assert.match(creativeSlotRecipe(1).promptDirective, /SLOT hero-clean/);
  assert.match(creativeSlotRecipe(2).promptDirective, /SLOT contextual-angle/);
  assert.notEqual(
    creativeSlotRecipe(1).promptDirective,
    creativeSlotRecipe(2).promptDirective,
    "slots must prescribe visibly different treatments",
  );

  const sharedInput = {
    productName: "شامبو العناية",
    headline: "جودة العناية بالشعر",
    benefitLine: "ترطيب عميق للشعر",
    salesLine: "جودة العناية مميزة لك",
    verifiedBenefit: "ترطيب عميق يدوم طويلاً للشعر",
  };
  const slot1Plan = headlinePlanForSlot(1, sharedInput);
  const slot2Plan = headlinePlanForSlot(2, sharedInput);
  assert.notEqual(slot1Plan.line1, slot2Plan.line1, "slot hierarchy must differ");
  assert.notEqual(slot1Plan.line3, slot2Plan.line3, "slot benefit emphasis must differ");
  for (const plan of [slot1Plan, slot2Plan]) {
    const lines = [plan.line1, plan.line2, plan.line3].filter(Boolean);
    assert.equal(new Set(lines).size, lines.length, "headline lines must not repeat each other");
    for (const line of lines) {
      assert.ok(line === sharedInput.salesLine || line === sharedInput.benefitLine ||
        line === sharedInput.verifiedBenefit || line === sharedInput.headline ||
        line === sharedInput.productName, `headline line must reuse supplied text: ${line}`);
    }
  }

  const rtlAnchors = commercialBadgeAnchors(660, "rtl");
  const ltrAnchors = commercialBadgeAnchors(660, "ltr");
  assert.equal(rtlAnchors.priceAnchor, "end");
  assert.equal(rtlAnchors.offerAnchor, "start");
  assert.equal(ltrAnchors.priceAnchor, "start");
  assert.equal(ltrAnchors.offerAnchor, "end");

  const prompt1 = buildDesignPromptBlock({ slot: 1, textDirection: "ltr" });
  const prompt2 = buildDesignPromptBlock({ slot: 2, textDirection: "rtl" });
  for (const prompt of [prompt1, prompt2]) {
    assert.match(prompt, /DESIGN SYSTEM/);
    assert.match(prompt, /no garbled pseudo-script/i);
    assert.match(prompt, /no generated price tags/i);
  }
  assert.match(prompt1, /left-to-right/);
  assert.match(prompt2, /right-to-left/);
  assert.notEqual(prompt1, prompt2);

  const backgroundPrompt = buildDesignPromptBlock({ slot: 1, backgroundOnly: true });
  assert.match(backgroundPrompt, /Stage-first framing/);
  assert.doesNotMatch(backgroundPrompt, /Keep the authentic product as the unmistakable hero/);

  const product = {
    title: "شامبو العناية الموثّق",
    category: "العناية بالشعر",
    features: ["تركيبة للعناية اليومية"],
    sourceUrl: "https://example.test/official-source",
    verificationStatus: "verified" as const,
    verifiedBenefits: ["ترطيب عميق يدوم طويلاً للشعر"],
    productImageUrl: "https://example.test/packshot.png",
    salesLine: "جودة عناية مميزة لك",
  };

  const variants = ProductionEngine.executeVariants({ product, today: "2026-11-24" });
  assert.equal(variants.length, 2);
  assert.deepEqual(variants.map((variant) => variant.metadata.designSlot), [1, 2]);
  assert.deepEqual(
    variants.map((variant) => variant.metadata.designRecipeId),
    ["hero-clean", "contextual-angle"],
  );
  assert.notEqual(variants[0].copy.hook, variants[1].copy.hook, "creative hooks must be slot-specific");
  assert.ok(variants[0].svgOverlay.includes('data-design-slot="1"'));
  assert.ok(variants[1].svgOverlay.includes('data-design-slot="2"'));
  assert.notEqual(
    variants[0].svgOverlay.match(/id="headline-line-1"[^>]*>([^<]+)</)?.[1],
    variants[1].svgOverlay.match(/id="headline-line-1"[^>]*>([^<]+)</)?.[1],
    "slot 1 and slot 2 must render different headline hierarchy",
  );
  for (const variant of variants) {
    assert.equal(variant.success, true, variant.blockers.join(" | "));
    assert.equal(variant.metadata.priceText, null);
    assert.equal(variant.metadata.offerText, null);
    assert.equal(variant.svgOverlay.includes("operator-offer-badge"), false);
  }

  const withMetadata = ProductionEngine.executeVariants({
    product: { ...product, price: 120, offerText: "عرض المنتج" },
    today: "2026-11-24",
  });
  for (const variant of withMetadata) {
    assert.equal(variant.metadata.priceText, "120 ج.م");
    assert.equal(variant.metadata.offerText, "عرض المنتج");
    assert.ok(variant.svgOverlay.includes("operator-offer-badge"));
  }

  const ltrOverlay = OverlaySystem.generateOverlaySvg({
    headline: product.title,
    designSlot: 2,
    textDirection: "ltr",
    priceText: "120 ج.م",
    offerText: "عرض المنتج",
  });
  assert.match(ltrOverlay, /<svg[^>]*dir="ltr"/);
  assert.match(ltrOverlay, /id="operator-offer-badge"[^>]*data-text-direction="ltr"/);
  assert.match(ltrOverlay, /text-anchor="start" direction="ltr"[^>]*>120 ج\.م</);
  assert.match(ltrOverlay, /data-design-slot="2"/);
  assert.match(ltrOverlay, /direction="ltr" unicode-bidi="plaintext"/);
}

async function testConditionalMetadata() {
  const product = {
    title: "شامبو العناية الموثّق",
    category: "العناية بالشعر",
    features: ["تركيبة للعناية اليومية"],
    sourceUrl: "https://example.test/official-source",
    verificationStatus: "verified" as const,
    verifiedBenefits: ["ترطيب عميق يدوم طويلاً للشعر"],
    verifiedUsage: ["يوضع على شعر مبلل ويُشطف"],
    productImageUrl: "https://example.test/packshot.png",
    warehouseStockStatus: "in_stock" as const,
  };

  const plain = OverlaySystem.generateOverlaySvg({
    width: 1080,
    height: 1920,
    headline: product.title,
  });
  assert.equal(plain.includes("operator-offer-badge"), false, "price/offer badge is absent by default");

  const priced = OverlaySystem.generateOverlaySvg({
    width: 1080,
    height: 1920,
    headline: product.title,
    priceText: "120 ج.م",
    offerText: "عرض المنتج",
  });
  assert.ok(priced.includes('id="operator-offer-badge"'), "explicit metadata renders a controlled badge");
  assert.ok(priced.includes("120 ج.م"));
  assert.ok(priced.includes("عرض المنتج"));

  const rejected = OverlaySystem.generateOverlaySvg({
    width: 1080,
    height: 1920,
    headline: product.title,
    offerText: "علاج مضمون لفترة محدودة",
  });
  assert.equal(rejected.includes("operator-offer-badge"), false, "unverified/urgency claims never render");

  const withMetadata = ProductionEngine.execute({
    product: { ...product, salesLine: "جودة عناية مميزة لك", price: 120, offerText: "عرض المنتج" },
    today: "2026-11-24",
  });
  assert.equal(withMetadata.success, true, withMetadata.blockers.join(" | "));
  assert.equal(withMetadata.metadata.salesLine, "جودة عناية مميزة لك");
  assert.equal(withMetadata.metadata.priceText, "120 ج.م");
  assert.equal(withMetadata.metadata.offerText, "عرض المنتج");
  assert.ok(withMetadata.svgOverlay.includes("operator-offer-badge"));

  const withoutMetadata = ProductionEngine.execute({ product, today: "2026-11-24" });
  assert.equal(withoutMetadata.metadata.priceText, null);
  assert.equal(withoutMetadata.metadata.offerText, null);
  assert.equal(withoutMetadata.svgOverlay.includes("operator-offer-badge"), false);
  assert.equal(withoutMetadata.qualityReport.overallScore >= withMetadata.qualityReport.overallScore, true);

  // Sales-line validation rejects invented claims and pricing language.
  assert.equal(isSafeSalesLine("جودة عناية مميزة لك"), true);
  assert.equal(isSafeSalesLine("علاج مضمون للشعر"), false);
  assert.equal(isSafeSalesLine("خصم 20% لفترة محدودة"), false);
  assert.equal(isSafeOfferText("عرض المنتج"), true);
  assert.equal(isSafeOfferText("علاج طبي مضمون"), false);
  assert.equal(sanitizeOfferText("عرض المنتج"), "عرض المنتج");
  assert.equal(
    buildStudioSalesLine({ detectedLabel: "شامبو العناية", detectedType: "العناية بالشعر" }),
    "جودة العناية بالشعر مميزة لك",
  );
}

const repoRoot = process.cwd();
const sourceFiles = (directory: string): string[] =>
  readdirSync(join(repoRoot, directory), { withFileTypes: true }).flatMap((entry) => {
    const full = join(repoRoot, directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(join(directory, entry.name));
    return /\.(ts|tsx)$/.test(entry.name) ? [join(directory, entry.name)] : [];
  });

function read(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

async function testBrandingAndLanguageContract() {
  // Every iDesign literal lives in the single brand config.
  const config = IDESIGN_STUDIO_CONFIG;
  assert.equal(config.name, "iDesign");
  assert.equal(config.productName, "AI Social Ad Studio");
  assert.equal(config.websiteUrl, "https://idesign.social");
  assert.equal(config.websiteLabel, "idesign.social");
  assert.equal(config.emailUrl, "mailto:info@idesign.social");
  assert.equal(config.whatsappUrl, "https://wa.me/201097362000");
  assert.equal(config.phoneLabel, "+201097362000");
  assert.equal(config.colors.royalBlue, "#1D4ED8");
  assert.equal(config.colors.royalBlueBright, "#2563EB");

  const banned = [
    "AI Social Ad Studio",
    "idesign.social",
    "info@idesign.social",
    "https://wa.me/201097362000",
    "+201097362000",
  ];
  const offenders = [...sourceFiles("src"), ...sourceFiles("functions")]
    .filter((file) => relative(repoRoot, join(repoRoot, file)).split("\\").join("/") !== "src/lib/al-rahma/brand-core.ts")
    .filter((file) => {
      const contents = readFileSync(join(repoRoot, file), "utf8");
      return banned.some((literal) => contents.includes(literal));
    })
    .map((file) => relative(repoRoot, join(repoRoot, file)).split("\\").join("/"));
  assert.deepEqual(offenders, [], "brand literals must only live in brand-core.ts");

  for (const file of [
    "src/app/page.tsx",
    "src/app/dashboard/page.tsx",
    "src/app/layout.tsx",
  ]) {
    const source = read(file);
    assert.ok(source.includes("IDESIGN_STUDIO_CONFIG"), `${file} must use the studio config`);
    assert.ok(source.includes("IDMark") || file.includes("layout"), `${file} must carry the iD mark`);
  }
  const dashboard = read("src/app/dashboard/page.tsx");
  assert.ok(dashboard.includes("LanguageSwitcher"));
  assert.ok(dashboard.includes('document.documentElement.lang = language'));
  assert.ok(dashboard.includes('document.documentElement.dir = direction'));
  assert.ok(dashboard.includes("downloadCreativesZip"));
  assert.ok(dashboard.includes('capture="environment"'));
  assert.ok(dashboard.includes("multiple"));
  assert.ok(dashboard.includes('mode: "basic"'));
  assert.ok(dashboard.includes("last_advertised_at"));

  // Six languages, accurate labels and RTL/LTR direction metadata.
  assert.deepEqual(
    LANGUAGES.map((item) => [item.code, item.label, item.dir]),
    [
      ["ar", "العربية", "rtl"],
      ["en", "English", "ltr"],
      ["ms", "Bahasa Melayu", "ltr"],
      ["fr", "Français", "ltr"],
      ["de", "Deutsch", "ltr"],
      ["zh", "中文", "ltr"],
    ],
  );
  assert.equal(languageDirection("ar"), "rtl");
  for (const code of ["en", "ms", "fr", "de", "zh"] as const) {
    assert.equal(languageDirection(code), "ltr");
    assert.ok(translate(code, "title").length > 0);
    assert.ok(I18N[code].generateNext.length > 0);
  }
  assert.equal(translate("ar", "title"), I18N.ar.title);

  // Runtime must stay on the existing D1 schema (no 0006 columns required).
  const runSource = read("functions/api/db/campaigns/run.ts");
  const productsSource = read("functions/api/db/products.ts");
  assert.equal(runSource.includes("ORDER BY RANDOM()"), false);
  for (const source of [runSource, productsSource]) {
    assert.equal(source.includes("p.offer_text"), false);
    assert.equal(source.includes("p.sales_line"), false);
    assert.equal(source.includes("0006_"), false);
  }
  assert.ok(runSource.includes("p.description"));
  assert.ok(runSource.includes("p.last_advertised_at IS NULL"));
  assert.ok(productsSource.includes("description AS sales_line"));
  assert.ok(productsSource.includes("productOfferSettingKey"));
  assert.ok(AL_RAHMA_BRAND_CONFIG.contact.whatsappUrl.startsWith("https://wa.me/"));
}

async function run() {
  await testSequentialNonRepeatingBatches();
  await testSingleProductAndCustomSelection();
  await testAlreadyGeneratedSelection();
  testDesignLibraryContract();
  await testConditionalMetadata();
  await testBrandingAndLanguageContract();
  console.log(
    "Basic Studio tests passed: sequential non-repeating batches with reload persistence, 2 distinct design slots per product, custom count/selection, already-generated 409, design-library hierarchy/prompt rules, conditional price/offer metadata with intact quality gate, RTL/LTR alignment, centralised iDesign branding/links, and six-language switcher contract.",
  );
}

void run();
