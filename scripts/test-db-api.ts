import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { onRequest as adminMiddleware } from "../functions/api/_middleware";
import { onRequestGet as getAssetCatalog } from "../functions/api/assets/catalog";
import { onRequestPost as postCommitMatch } from "../functions/api/assets/commit-match";
import { onRequestPost as postAssetUpload } from "../functions/api/assets/upload";
import { onRequestPost as postVisionMatch } from "../functions/api/assets/vision-match";
import { onRequestGet as getBrands } from "../functions/api/db/brands";
import { onRequestGet as getCampaigns } from "../functions/api/db/campaigns";
import { onRequestPost as runCampaign } from "../functions/api/db/campaigns/run";
import { onRequestGet as getProducts } from "../functions/api/db/products";
import { onRequestGet as getResearch } from "../functions/api/db/research";
import { onRequestPost as postBulkIngest } from "../functions/api/db/research/bulk-ingest";
import { onRequestPost as postResearchIngest } from "../functions/api/db/research/ingest";
import {
  onRequestGet as getCalendar,
  onRequestPost as postCalendar,
} from "../functions/api/db/calendar";
import {
  onRequestGet as getPromos,
  onRequestPost as postPromos,
} from "../functions/api/db/promos";
import { onRequestGet as getStats } from "../functions/api/db/stats";
import {
  bestFilenameMatch,
  matchProductsByFilename,
} from "../src/lib/al-rahma/filename-matcher";

type BoundValue = string | number | null;

const ASSET_CATALOG = [
  {
    id: "product-1",
    name_arabic: "شامبو فاتيكا بزيت الزيتون",
    name_english: "Vatika olive shampoo",
    category: "shampoo",
    verification_status: "needs_verification",
    brand_arabic: "فاتيكا",
    brand_english: "Vatika",
    brand_slug: "vatika",
  },
  {
    id: "product-2",
    name_arabic: "ماسك ألو إيفا بالصبار",
    name_english: "Eva aloe mask",
    category: "hair_mask",
    verification_status: "needs_verification",
    brand_arabic: "إيفا",
    brand_english: "Eva",
    brand_slug: "eva",
  },
  {
    id: "product-3",
    name_arabic: "عطر العنبر الملكي",
    name_english: "Royal amber perfume",
    category: "perfume",
    verification_status: "verified",
    brand_arabic: "الرحمة",
    brand_english: "Al Rahma",
    brand_slug: "al-rahma",
  },
];

class MockStatement {
  values: BoundValue[] = [];

  constructor(
    readonly sql: string,
    private readonly database: MockDatabase,
  ) {}

  bind(...values: BoundValue[]) {
    this.values = values;
    return this;
  }

  async first<T>(): Promise<T | null> {
    this.database.calls.push({ sql: this.sql, values: this.values });

    // asset catalog aggregate counts
    if (this.sql.includes("SUM(CASE WHEN verification_status = 'verified'")) {
      return {
        total: ASSET_CATALOG.length,
        verified: ASSET_CATALOG.filter(
          (product) => product.verification_status === "verified",
        ).length,
      } as T;
    }

    // asset upload product lookup (product + brand)
    if (
      this.sql.includes("FROM products p") &&
      this.sql.includes("JOIN brands b") &&
      this.sql.includes("WHERE p.id = ?")
    ) {
      const product = ASSET_CATALOG.find((row) => row.id === this.values[0]);
      return product ? ({ ...product } as unknown as T) : null;
    }

    // counts
    if (this.sql.includes("COUNT(*)") && this.sql.includes("products")) {
      return { count: 177 } as T;
    }
    if (this.sql.includes("COUNT(*)") && this.sql.includes("brands")) {
      return { count: 7 } as T;
    }
    if (this.sql.includes("COUNT(*)") && this.sql.includes("product_assets")) {
      return { count: 0 } as T;
    }
    if (this.sql.includes("COUNT(*)") && this.sql.includes("campaigns")) {
      return { count: 0 } as T;
    }
    if (this.sql.includes("COUNT(*)") && this.sql.includes("creatives")) {
      return { count: 0 } as T;
    }

    // research / ingest product lookups
    if (this.sql.includes("FROM products") && this.sql.includes("WHERE id = ?")) {
      if (this.values[0] !== "product-1") return null;
      // product + category (bulk) or ingest result
      if (this.sql.includes("category")) {
        return { id: "product-1", category: "hair_care" } as T;
      }
      if (this.sql.includes("verification_status")) {
        return {
          id: "product-1",
          name_arabic: "منتج العناية",
          verification_status: "verified",
          confidence_score: 0.9,
          warehouse_stock_status: "in_stock",
        } as T;
      }
      return { id: "product-1", name_arabic: "منتج العناية" } as T;
    }

    if (
      this.sql.includes("FROM product_information_sources") &&
      this.sql.includes("source_url = ?")
    ) {
      return null;
    }
    if (
      this.sql.includes("FROM product_assets") &&
      this.sql.includes("image_url = ?")
    ) {
      return null;
    }

    if (this.sql.includes("WHERE p.id = ?")) {
      return this.values[0] === "product-1"
        ? ({
            id: "product-1",
            name_arabic: "منتج العناية",
            name_english: "Care product",
            category: "hair_care",
            subcategory: null,
            packaging_size: null,
            variant: null,
            verification_status: "needs_verification",
            brand_arabic: "فاتيكا",
            brand_english: "Vatika",
            brand_slug: "vatika",
          } as T)
        : null;
    }

    // promos
    if (
      this.sql.includes("FROM product_promotions") &&
      this.sql.includes("original_price = ?")
    ) {
      return null; // no duplicate existing promo
    }
    if (
      this.sql.includes("FROM product_promotions pp") &&
      this.sql.includes("WHERE pp.id = ?")
    ) {
      return {
        id: "promo-1",
        product_id: "product-1",
        product_name_arabic: "منتج العناية",
        original_price: 200,
        discount_percent: 25,
        promo_price: 150,
        starts_at: "2026-11-01",
        ends_at: "2026-11-30",
        is_active: 1,
        created_at: 1,
      } as T;
    }

    // calendar
    if (this.sql.includes("FROM cultural_calendar") && this.sql.includes("WHERE id = ?")) {
      return this.values[0] === "cc-eg-ramadan"
        ? ({
            id: "cc-eg-ramadan",
            country_code: "EG",
            occasion_name_arabic: "شهر رمضان الكريم",
            greeting_text_arabic: "كل عام وأنتم بخير بمناسبة شهر رمضان الكريم",
            occasion_date: "2027-02-18",
            lead_days: 2,
            accent_theme: "emerald",
            is_active: 1,
          } as T)
        : null;
    }
    if (
      this.sql.includes("FROM cultural_calendar") &&
      this.sql.includes("country_code = ?") &&
      this.sql.includes("occasion_name_arabic = ?")
    ) {
      return {
        id: "cc-eg-new",
        country_code: this.values[0],
        occasion_name_arabic: this.values[1],
        greeting_text_arabic: this.values[2] ?? "تهنئة",
        occasion_date: this.values[3],
        lead_days: 2,
        accent_theme: null,
        is_active: 1,
      } as unknown as T;
    }

    return null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    this.database.calls.push({ sql: this.sql, values: this.values });

    if (this.sql.includes("COUNT(p.id) AS product_count")) {
      return {
        results: [
          {
            id: "brand-1",
            name_arabic: "فاتيكا",
            name_english: "Vatika",
            slug: "vatika",
            identity_status: "verified",
            product_count: 47,
          } as T,
        ],
      };
    }
    if (this.sql.includes("SELECT DISTINCT category")) {
      return { results: [{ category: "shampoo" } as T] };
    }
    if (this.sql.includes("FROM products p") && this.sql.includes("LIMIT ? OFFSET ?")) {
      return {
        results: [
          {
            id: "product-1",
            name_arabic: "شامبو",
            name_english: null,
            category: "shampoo",
            subcategory: null,
            packaging_size: null,
            variant: null,
            egypt_market_status: "unknown",
            warehouse_stock_status: "unknown",
            verification_status: "needs_verification",
            confidence_score: 0,
            brand_arabic: "فاتيكا",
            brand_english: "Vatika",
            brand_slug: "vatika",
            image_url: null,
            image_source: null,
          } as T,
        ],
      };
    }
    if (
      this.sql.includes("FROM products p") &&
      this.sql.includes("b.name_arabic AS brand_arabic") &&
      this.sql.includes("LIMIT ?") &&
      !this.sql.includes("OFFSET")
    ) {
      return { results: ASSET_CATALOG as unknown as T[] };
    }
    if (this.sql.includes("SELECT claim_type, claim_text FROM product_research_claims")) {
      return { results: [] };
    }
    if (this.sql.includes("FROM product_assets")) {
      return { results: [] };
    }
    if (this.sql.includes("FROM product_information_sources")) {
      return { results: [] };
    }
    if (this.sql.includes("FROM product_research_claims")) {
      return {
        results: [
          {
            id: "benefit-verified",
            source_id: "source-verified",
            source_name: "Official source",
            source_url: "https://example.test/official",
            source_verification_status: "verified",
            claim_type: "benefit",
            claim_text: "Verified benefit",
            verification_status: "verified",
            verified_at: 1,
            notes: null,
          },
          {
            id: "usage-verified",
            source_id: "source-verified",
            source_name: "Official source",
            source_url: "https://example.test/official",
            source_verification_status: "verified",
            claim_type: "usage",
            claim_text: "Verified usage",
            verification_status: "verified",
            verified_at: 1,
            notes: null,
          },
          {
            id: "usage-unverified",
            source_id: "source-unverified",
            source_name: "Unverified source",
            source_url: "https://example.test/unverified",
            source_verification_status: "unverified",
            claim_type: "usage",
            claim_text: "Unverified usage",
            verification_status: "unverified",
            verified_at: null,
            notes: null,
          },
        ] as T[],
      };
    }
    if (this.sql.includes("FROM warehouse_stock_checks")) {
      return { results: [] };
    }

    // promos GET
    if (this.sql.includes("FROM product_promotions pp")) {
      return {
        results: [
          {
            id: "promo-1",
            product_id: "product-1",
            product_name_arabic: "منتج العناية",
            original_price: 200,
            discount_percent: 25,
            promo_price: 150,
            starts_at: "2020-01-01",
            ends_at: "2099-12-31",
            is_active: 1,
            created_at: 1,
          } as T,
        ],
      };
    }

    // calendar GET
    if (this.sql.includes("FROM cultural_calendar")) {
      return {
        results: [
          {
            id: "cc-eg-mothers-day",
            country_code: "EG",
            occasion_name_arabic: "عيد الأم",
            greeting_text_arabic: "كل عام وأنتم بخير بمناسبة عيد الأم",
            occasion_date: "2027-03-21",
            lead_days: 2,
            accent_theme: "rose",
            is_active: 1,
          } as T,
        ],
      };
    }

    // bulk product lookup
    if (this.sql.includes("SELECT id, category FROM products WHERE id IN")) {
      return { results: [{ id: "product-1", category: "hair_care" } as T] };
    }

    return { results: [] };
  }

  async run(): Promise<{ success: boolean }> {
    this.database.calls.push({ sql: this.sql, values: this.values });
    return { success: true };
  }
}

class MockDatabase {
  calls: { sql: string; values: BoundValue[] }[] = [];

  prepare(sql: string) {
    return new MockStatement(sql, this);
  }

  async batch(statements: MockStatement[]) {
    for (const statement of statements) {
      this.calls.push({ sql: statement.sql, values: statement.values });
    }
    return statements.map(() => ({ success: true }));
  }
}

function context(
  database: MockDatabase,
  url: string,
  init?: RequestInit,
  envExtra: Record<string, unknown> = {},
) {
  return {
    request: new Request(url, init),
    env: { DB: database as unknown as D1Database, ...envExtra },
  } as unknown as Parameters<typeof getProducts>[0];
}

async function json(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

class CampaignStatement {
  values: BoundValue[] = [];
  constructor(
    readonly sql: string,
    private readonly database: CampaignDatabase,
  ) {}

  bind(...values: BoundValue[]) {
    this.values = values;
    return this;
  }

  async first<T>(): Promise<T | null> {
    this.database.calls.push({ sql: this.sql, values: this.values });
    if (this.sql.includes("FROM product_promotions") && this.sql.includes("product_id = ?")) {
      return null;
    }
    return null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    this.database.calls.push({ sql: this.sql, values: this.values });

    // campaign run eligible selection
    if (
      this.sql.includes("FROM products p") &&
      this.sql.includes("JOIN product_assets pa") &&
      this.sql.includes("p.verification_status = 'verified'")
    ) {
      return { results: this.database.eligibleProducts as T[] };
    }

    // loadActiveOccasion calendar rows
    if (this.sql.includes("FROM cultural_calendar") && this.sql.includes("country_code = 'EG'")) {
      return { results: [] };
    }

    // research sources / claims
    if (this.sql.includes("FROM product_information_sources")) {
      return { results: [] };
    }
    if (this.sql.includes("FROM product_research_claims")) {
      return { results: [] };
    }

    // campaigns GET
    if (this.sql.includes("FROM campaigns") && this.sql.includes("ORDER BY created_at DESC")) {
      return {
        results: [
          {
            id: "camp-1",
            campaign_date: "2026-11-15",
            status: "completed",
            selected_product_ids: '["p1","p2"]',
            total_products: 2,
            total_images: 4,
            started_at: 1,
            completed_at: 2,
            error_summary: null,
            created_at: 2,
          } as T,
        ],
      };
    }
    if (this.sql.includes("FROM creatives c") && this.sql.includes("WHERE c.campaign_id IN")) {
      return {
        results: [
          {
            id: "cr-1",
            product_id: "p1",
            campaign_id: "camp-1",
            variant_number: 1,
            image_url: "data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C/svg%3E",
            storage_key: null,
            style_id: "al-rahma/silver-podium-botanical",
            headline_arabic: "عنوان",
            copy_arabic: "نص",
            quality_status: "passed",
            quality_notes: "{}",
            created_at: 2,
            product_name_arabic: "منتج 1",
            brand_arabic: "فاتيكا",
            brand_slug: "vatika",
          } as T,
        ],
      };
    }

    return { results: [] };
  }

  async run(): Promise<{ success: boolean }> {
    this.database.calls.push({ sql: this.sql, values: this.values });
    return { success: true };
  }
}

class CampaignDatabase {
  calls: { sql: string; values: BoundValue[] }[] = [];
  eligibleProducts: Record<string, unknown>[] = [];

  prepare(sql: string) {
    return new CampaignStatement(sql, this);
  }

  async batch(statements: CampaignStatement[]) {
    for (const statement of statements) {
      this.calls.push({ sql: statement.sql, values: statement.values });
    }
    return statements.map(() => ({ success: true }));
  }
}

async function testCampaignEndpoints() {
  // GET /api/db/campaigns lists campaigns with creatives
  const listDb = new CampaignDatabase();
  const listRes = await getCampaigns(
    context(listDb as unknown as MockDatabase, "https://example.test/api/db/campaigns?limit=10"),
  );
  const listBody = await json(listRes);
  assert.equal(listRes.status, 200);
  assert.equal(listBody.success, true);
  assert.equal(
    listRes.headers.get("Cache-Control"),
    "no-store, max-age=0, must-revalidate",
    "Campaign gallery reads must never be served stale.",
  );
  assert.equal((listBody.campaigns as unknown[]).length, 1);
  const firstCampaign = (listBody.campaigns as { creatives: unknown[] }[])[0];
  assert.equal(firstCampaign.creatives.length, 1);

  // POST /api/db/campaigns/run: 3 eligible products => 6 creatives, cooldown ordering query
  const runDb = new CampaignDatabase();
  runDb.eligibleProducts = [
    {
      id: "p-never",
      name_arabic: "منتج لم يُعلن",
      name_english: null,
      category: "hair_care",
      verification_status: "verified",
      warehouse_stock_status: "in_stock",
      last_advertised_at: null,
      image_url: "https://example.test/p-never.png",
      image_source: "https://example.test/source-never",
      brand_arabic: "فاتيكا",
      brand_slug: "vatika",
    },
    {
      id: "p-old",
      name_arabic: "منتج قديم الإعلان",
      name_english: null,
      category: "hair_care",
      verification_status: "verified",
      warehouse_stock_status: "in_stock",
      last_advertised_at: Date.now() - 10 * 86_400_000,
      image_url: "https://example.test/p-old.png",
      image_source: "https://example.test/source-old",
      brand_arabic: "مينك",
      brand_slug: "mink",
    },
    {
      id: "p-recent",
      name_arabic: "منتج حديث الإعلان",
      name_english: null,
      category: "hair_care",
      verification_status: "verified",
      warehouse_stock_status: "in_stock",
      last_advertised_at: Date.now() - 2 * 86_400_000,
      image_url: "https://example.test/p-recent.png",
      image_source: "https://example.test/source-recent",
      brand_arabic: "عساف",
      brand_slug: "assaf",
    },
  ];

  const runRes = await runCampaign(
    context(
      runDb as unknown as MockDatabase,
      "https://example.test/api/db/campaigns/run",
      { method: "POST", body: JSON.stringify({}) },
    ),
  );
  const runBody = await json(runRes);
  assert.equal(runRes.status, 200, JSON.stringify(runBody));
  assert.equal(runBody.success, true);
  const campaign = runBody.campaign as { total_products: number; total_images: number };
  assert.equal(campaign.total_products, 3);
  assert.equal(campaign.total_images, 6, "2 variants per product must be generated.");
  assert.ok(
    String(runBody.message).includes("3"),
    "Response should report available count when fewer than 5.",
  );

  const creatives = runBody.creatives as {
    variant_number: number;
    product_id: string;
    socialCaption?: string;
    art_direction_style?: string;
    art_direction_label?: string;
    ai_engine?: string;
    cutout_applied?: boolean;
    ai_composite?: boolean;
    contains_product?: boolean;
    used_reference?: boolean;
    composite_provider?: string | null;
    svg?: string;
    artDirection?: {
      styleId?: string;
      engine?: string;
      cutoutApplied?: boolean;
      stagedProduct?: boolean;
      backgroundOnly?: boolean;
      aiComposite?: boolean;
      containsProduct?: boolean;
      usedReference?: boolean;
      compositeProvider?: string | null;
      compositeModel?: string | null;
    };
  }[];
  assert.equal(creatives.length, 6);
  for (const pid of ["p-never", "p-old", "p-recent"]) {
    const productCreatives = creatives.filter((c) => c.product_id === pid);
    assert.equal(productCreatives.length, 2, `product ${pid} must have 2 variants`);
    assert.deepEqual(
      productCreatives.map((c) => c.variant_number).sort(),
      [1, 2],
    );
    const styles = productCreatives.map((c) => c.artDirection?.styleId);
    assert.equal(
      new Set(styles).size,
      2,
      `product ${pid} variants must use two distinct art directions.`,
    );
  }

  // Every creative must carry art-direction/engine metadata for the gallery badges.
  for (const creative of creatives) {
    assert.ok(creative.artDirection, "Creative must record artDirection metadata.");
    assert.ok(creative.art_direction_style, "Creative must expose art_direction_style.");
    assert.ok(creative.art_direction_label, "Creative must expose the Arabic style label.");
    assert.ok(creative.ai_engine, "Creative must expose the AI engine.");
    assert.equal(
      creative.cutout_applied,
      creative.artDirection?.cutoutApplied,
      "cutout_applied must match the recorded art direction.",
    );
    assert.equal(
      creative.artDirection?.engine,
      creative.ai_engine,
      "Art direction engine must match ai_engine.",
    );
    assert.equal(
      creative.artDirection?.aiComposite,
      false,
      "Without an image-to-image provider the run must fall back to a background plate.",
    );
    assert.equal(creative.artDirection?.backgroundOnly, true);
    assert.equal(creative.artDirection?.stagedProduct, false);
    assert.equal(creative.artDirection?.usedReference, false);
    assert.equal(creative.ai_composite, false);
    assert.equal(creative.contains_product, false);
    assert.equal(creative.used_reference, false);
  }

  assert.equal(
    runRes.headers.get("Cache-Control"),
    "no-store, max-age=0, must-revalidate",
    "Campaign runs must return fresh, uncached creatives.",
  );
  assert.ok(
    (runBody.artDirectionStyles as Record<string, unknown>)["sunlit-travertine"],
    "Run response must include the five art directions.",
  );

  // Selection query must randomize eligible products every run
  const selectCall = runDb.calls.find(
    (c) => c.sql.includes("FROM products p") && c.sql.includes("JOIN product_assets pa"),
  );
  assert.ok(selectCall, "eligible products query must run");
  assert.ok(selectCall.sql.includes("ORDER BY RANDOM()"), "Campaign selection must use ORDER BY RANDOM()");
  assert.ok(
    selectCall.sql.includes("pa.is_primary = 1") &&
      selectCall.sql.includes("pa.image_type = 'reference'") &&
      selectCall.sql.includes("pa.verification_status = 'verified'"),
    "Campaign selection must only use verified primary reference images (including dashboard uploads).",
  );
  assert.ok(
    selectCall.sql.includes("WHERE p.verification_status = 'verified'"),
    "Campaign selection must only use verified products.",
  );
  assert.equal(selectCall.sql.includes("last_advertised_at IS NULL"), false, "Random selection must not prioritize last_advertised_at cooldown ordering.");

  // Persistence: campaign insert, 6 creative inserts, 3 last_advertised_at updates
  const campaignInserts = runDb.calls.filter((c) => c.sql.includes("INSERT INTO campaigns"));
  assert.equal(campaignInserts.length, 1);
  const creativeInserts = runDb.calls.filter((c) => c.sql.includes("INSERT INTO creatives"));
  assert.equal(creativeInserts.length, 6);
  const productUpdates = runDb.calls.filter((c) =>
    c.sql.includes("UPDATE products SET last_advertised_at"),
  );
  assert.equal(productUpdates.length, 3);

  // POST /api/db/campaigns/run with no eligible products -> empty campaign
  const emptyDb = new CampaignDatabase();
  emptyDb.eligibleProducts = [];
  const emptyRes = await runCampaign(
    context(
      emptyDb as unknown as MockDatabase,
      "https://example.test/api/db/campaigns/run",
      { method: "POST", body: JSON.stringify({}) },
    ),
  );
  const emptyBody = await json(emptyRes);
  assert.equal(emptyRes.status, 200);
  assert.equal((emptyBody.campaign as { status: string }).status, "empty");
  assert.equal((emptyBody.creatives as unknown[]).length, 0);
}

/**
 * Authorized reference-conditioned compositing wiring: when Workers AI returns
 * an image-to-image composite, the campaign records it as containing the real
 * product and the SVG overlay must not paste a second flat packshot.
 */
async function testCompositeCampaignWiring() {
  const db = new CampaignDatabase();
  db.eligibleProducts = [
    {
      id: "p-composite",
      name_arabic: "شامبو موثّق للتركيب",
      name_english: null,
      category: "hair_care",
      verification_status: "verified",
      warehouse_stock_status: "in_stock",
      last_advertised_at: null,
      image_url: `data:image/png;base64,${TINY_PNG_BASE64}`,
      image_source: "https://example.test/source-composite",
      brand_arabic: "فاتيكا",
      brand_slug: "vatika",
    },
  ];

  const models: string[] = [];
  const aiEnv = {
    AI: {
      run: async (model: string, input: Record<string, unknown>) => {
        models.push(model);
        if (model === "@cf/runwayml/stable-diffusion-v1-5-img2img") {
          assert.ok(
            Array.isArray(input.image),
            "Composite img2img must receive the authentic cutout bytes.",
          );
        }
        return { image: TINY_PNG_BASE64 };
      },
    },
  };

  const res = await runCampaign(
    context(
      db as unknown as MockDatabase,
      "https://example.test/api/db/campaigns/run",
      { method: "POST", body: JSON.stringify({ limit: 1 }) },
      aiEnv,
    ),
  );
  const body = await json(res);
  assert.equal(res.status, 200, JSON.stringify(body));

  const creatives = body.creatives as {
    ai_composite?: boolean;
    contains_product?: boolean;
    used_reference?: boolean;
    composite_provider?: string | null;
    svg?: string;
    artDirection?: {
      aiComposite?: boolean;
      containsProduct?: boolean;
      usedReference?: boolean;
      compositeProvider?: string | null;
      backgroundOnly?: boolean;
      stagedProduct?: boolean;
    };
  }[];
  assert.equal(creatives.length, 2);

  for (const creative of creatives) {
    assert.equal(creative.ai_composite, true, "Provider image must be recorded as an AI composite.");
    assert.equal(creative.contains_product, true);
    assert.equal(creative.used_reference, true);
    assert.equal(creative.composite_provider, "workers-ai-img2img");
    assert.equal(creative.artDirection?.aiComposite, true);
    assert.equal(creative.artDirection?.containsProduct, true);
    assert.equal(creative.artDirection?.usedReference, true);
    assert.equal(creative.artDirection?.compositeProvider, "workers-ai-img2img");
    assert.equal(creative.artDirection?.backgroundOnly, false);
    assert.equal(creative.artDirection?.stagedProduct, true);
    assert.ok(String(creative.svg).includes('data-ai-composite="true"'));
    assert.equal(
      String(creative.svg).includes('id="packshot-hero"'),
      false,
      "A composite must not be duplicated by a flat SVG packshot.",
    );
    assert.ok(
      String(creative.svg).includes("url(#metallic-gold-gradient)"),
      "Metallic gold typography must render over the composite.",
    );
  }

  assert.ok(models.includes("@cf/runwayml/stable-diffusion-v1-5-img2img"));
}

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function tinyPngBytes(): Uint8Array {
  return Uint8Array.from(Buffer.from(TINY_PNG_BASE64, "base64"));
}

function uploadForm(
  productId: string,
  fileName: string,
  extra: Record<string, string> = {},
): FormData {
  const form = new FormData();
  form.set("productId", productId);
  form.set(
    "imageFile",
    new File([tinyPngBytes()], fileName, { type: "image/png" }),
  );
  for (const [key, value] of Object.entries(extra)) {
    form.set(key, value);
  }
  return form;
}

async function testFilenameMatching() {
  const vatika = bestFilenameMatch("vatika-shampoo-olive.jpg", ASSET_CATALOG);
  assert.ok(vatika, "A Latin filename with brand + product must match.");
  assert.equal(vatika?.product.id, "product-1");
  assert.equal(vatika?.confidence, "high");

  const arabic = bestFilenameMatch("ماسك-الو-ايفا-بالصبار.jpg", ASSET_CATALOG);
  assert.ok(arabic, "An Arabic filename must match after normalization.");
  assert.equal(arabic?.product.id, "product-2");
  assert.equal(arabic?.confidence, "high");

  const perfume = bestFilenameMatch("الرحمة-عطر-العنبر.png", ASSET_CATALOG);
  assert.equal(perfume?.product.id, "product-3");

  const chatNoise = matchProductsByFilename(
    "WhatsApp Image 2026-11-17 at 10.32.11.jpeg",
    ASSET_CATALOG,
  );
  assert.equal(chatNoise.length, 0, "Chat noise must not produce false matches.");

  const unnamed = matchProductsByFilename("IMG_1234.jpg", ASSET_CATALOG);
  assert.equal(unnamed.length, 0, "Camera filenames must not produce false matches.");

  const generic = bestFilenameMatch("شامبو.jpg", ASSET_CATALOG);
  assert.ok(generic, "A generic product word still yields a candidate.");
  assert.equal(
    generic?.confidence,
    "low",
    "A single generic token must stay low confidence so bulk upload asks for a manual pick.",
  );
}

async function testAssetEndpoints() {
  // GET /api/assets/catalog
  const catalogDb = new MockDatabase();
  const catalogRes = await getAssetCatalog(
    context(catalogDb, "https://example.test/api/assets/catalog"),
  );
  const catalogBody = await json(catalogRes);
  assert.equal(catalogRes.status, 200);
  assert.equal(catalogBody.success, true);
  assert.equal((catalogBody.products as unknown[]).length, 3);
  assert.deepEqual(catalogBody.counts, { total: 3, verified: 1, pending: 2 });
  assert.equal(
    catalogRes.headers.get("Cache-Control"),
    "no-store, max-age=0, must-revalidate",
  );

  // POST /api/assets/upload — multipart, embedded fallback, no AI bound
  const uploadDb = new MockDatabase();
  const uploadRes = await postAssetUpload(
    context(uploadDb, "https://example.test/api/assets/upload", {
      method: "POST",
      body: uploadForm("product-1", "packshot.png", { autoCutout: "false" }),
    }),
  );
  const uploadBody = await json(uploadRes);
  assert.equal(uploadRes.status, 200, JSON.stringify(uploadBody));
  assert.equal(uploadBody.success, true);
  assert.equal(
    (uploadBody.product as { verification_status: string }).verification_status,
    "verified",
  );
  assert.equal((uploadBody.asset as { storage: string }).storage, "embedded");
  assert.equal((uploadBody.cutout as { applied: boolean }).applied, false);
  assert.equal((uploadBody.claims as { inserted: number }).inserted, 0);

  const uploadSql = uploadDb.calls.map((call) => call.sql);
  assert.ok(
    uploadSql.some((sql) =>
      sql.includes("UPDATE product_assets SET is_primary = 0"),
    ),
    "The previous primary asset must be demoted, not deleted.",
  );
  const assetInsert = uploadDb.calls.find((call) =>
    call.sql.includes("INSERT INTO product_assets"),
  );
  assert.ok(assetInsert);
  assert.ok(
    String(assetInsert?.values[2]).startsWith("data:image/png;base64,"),
    "Without R2 the upload must be stored as an optimized embedded data URI.",
  );
  assert.equal(
    assetInsert?.values[4],
    null,
    "Embedded uploads must not claim an R2 storage key.",
  );
  const productUpdate = uploadDb.calls.find((call) =>
    call.sql.includes("UPDATE products"),
  );
  assert.ok(productUpdate?.sql.includes("verification_status = 'verified'"));

  // autoCutout requested but Workers AI is not bound -> graceful fallback
  const cutoutDb = new MockDatabase();
  const cutoutRes = await postAssetUpload(
    context(cutoutDb, "https://example.test/api/assets/upload", {
      method: "POST",
      body: uploadForm("product-2", "mask.png", { autoCutout: "true" }),
    }),
  );
  const cutoutBody = await json(cutoutRes);
  assert.equal(cutoutRes.status, 200);
  assert.equal((cutoutBody.cutout as { requested: boolean }).requested, true);
  assert.equal((cutoutBody.cutout as { applied: boolean }).applied, false);
  assert.ok((cutoutBody.cutout as { note: string | null }).note);

  // Claims without a verified source are rejected (no invented marketing copy)
  const noSourceRes = await postAssetUpload(
    context(new MockDatabase(), "https://example.test/api/assets/upload", {
      method: "POST",
      body: uploadForm("product-1", "pack.png", {
        autoCutout: "false",
        benefits: "ترطيب عميق",
      }),
    }),
  );
  assert.equal(noSourceRes.status, 400);

  // A source URL alone is stored as verified provenance for the quality gate.
  const sourceDb = new MockDatabase();
  const sourceRes = await postAssetUpload(
    context(sourceDb, "https://example.test/api/assets/upload", {
      method: "POST",
      body: uploadForm("product-2", "mask.png", {
        autoCutout: "false",
        sourceUrl: "https://example.test/product-page",
      }),
    }),
  );
  assert.equal(sourceRes.status, 200);
  assert.ok(
    sourceDb.calls.some((call) =>
      call.sql.includes("INSERT INTO product_information_sources"),
    ),
  );
  assert.equal(
    sourceDb.calls.filter((call) =>
      call.sql.includes("INSERT INTO product_research_claims"),
    ).length,
    0,
    "A source URL must not invent benefit claims.",
  );

  // Grounded claims are stored with a verified source
  const groundedDb = new MockDatabase();
  const groundedRes = await postAssetUpload(
    context(groundedDb, "https://example.test/api/assets/upload", {
      method: "POST",
      body: uploadForm("product-1", "pack.png", {
        autoCutout: "false",
        sourceUrl: "https://example.test/official",
        benefits: "ترطيب عميق\nلمعان طبيعي",
      }),
    }),
  );
  const groundedBody = await json(groundedRes);
  assert.equal(groundedRes.status, 200, JSON.stringify(groundedBody));
  assert.equal((groundedBody.claims as { inserted: number }).inserted, 2);
  assert.ok(
    groundedDb.calls.some((call) =>
      call.sql.includes("INSERT INTO product_information_sources"),
    ),
  );
  assert.equal(
    groundedDb.calls.filter((call) =>
      call.sql.includes("INSERT INTO product_research_claims"),
    ).length,
    2,
  );

  // Unknown product -> 404 without touching assets
  const missingDb = new MockDatabase();
  const missingRes = await postAssetUpload(
    context(missingDb, "https://example.test/api/assets/upload", {
      method: "POST",
      body: uploadForm("missing", "x.png"),
    }),
  );
  assert.equal(missingRes.status, 404);
  assert.equal(
    missingDb.calls.filter((call) => call.sql.includes("INSERT INTO product_assets"))
      .length,
    0,
  );

  // Non-multipart bodies are refused
  const jsonRes = await postAssetUpload(
    context(new MockDatabase(), "https://example.test/api/assets/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: "product-1" }),
    }),
  );
  assert.equal(jsonRes.status, 415);

  // Missing image file -> 400
  const emptyForm = new FormData();
  emptyForm.set("productId", "product-1");
  const emptyRes = await postAssetUpload(
    context(new MockDatabase(), "https://example.test/api/assets/upload", {
      method: "POST",
      body: emptyForm,
    }),
  );
  assert.equal(emptyRes.status, 400);
}

function tinyPngDataUrl(): string {
  return `data:image/png;base64,${TINY_PNG_BASE64}`;
}

function visionForm(fileName: string): FormData {
  const form = new FormData();
  form.set(
    "imageFile",
    new File([tinyPngBytes()], fileName, { type: "image/png" }),
  );
  form.set("fileName", fileName);
  return form;
}

function geminiReply(payload: Record<string, unknown>): Response {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

async function testVisionEndpoints() {
  const url = "https://example.test/api/assets/vision-match";

  // No vision provider bound -> filename fallback still matches.
  const filenameDb = new MockDatabase();
  const filenameRes = await postVisionMatch(
    context(filenameDb, url, {
      method: "POST",
      body: visionForm("vatika-shampoo-olive.jpg"),
    }),
  );
  const filenameBody = await json(filenameRes);
  assert.equal(filenameRes.status, 200, JSON.stringify(filenameBody));
  assert.equal(filenameBody.success, true);
  assert.equal((filenameBody.match as { productId: string }).productId, "product-1");
  assert.equal((filenameBody.match as { provider: string }).provider, "filename");
  assert.equal((filenameBody.match as { confidence: string }).confidence, "high");
  assert.equal(
    (filenameBody.vision as { geminiConfigured: boolean }).geminiConfigured,
    false,
  );
  assert.ok(
    filenameDb.calls.some((call) => call.sql.includes("LIMIT ?")),
    "Vision matching must load the D1 catalog.",
  );

  // Phone/chat filenames must not invent a match.
  const noMatchRes = await postVisionMatch(
    context(new MockDatabase(), url, {
      method: "POST",
      body: visionForm("WhatsApp Image 2026-11-17 at 10.32.11.jpeg"),
    }),
  );
  const noMatchBody = await json(noMatchRes);
  assert.equal(noMatchRes.status, 200);
  assert.equal((noMatchBody.match as { productId: string | null }).productId, null);
  assert.match(
    String(noMatchBody.message),
    /اختر المنتج/,
    "An unmatched image must ask for manual review.",
  );

  // Gemini is used when GEMINI_API_KEY is bound; the returned id must be in D1.
  const originalFetch = globalThis.fetch;
  let geminiCalled = false;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const calledUrl = String(input);
    assert.ok(
      calledUrl.includes("generativelanguage.googleapis.com"),
      "Gemini must be called through the generative language API.",
    );
    geminiCalled = true;
    return geminiReply({
      productId: "product-2",
      confidence: "high",
      detectedLabel: "ماسك ألو إيفا بالصبار",
      detectedBrand: "إيفا",
      detectedType: "ماسك شعر",
      reasoning: "اسم العبوة مقروء بالكامل",
    });
  }) as typeof fetch;

  try {
    const geminiRes = await postVisionMatch(
      context(
        new MockDatabase(),
        url,
        { method: "POST", body: visionForm("IMG_4432.jpg") },
        { GEMINI_API_KEY: "test-key" },
      ),
    );
    const geminiBody = await json(geminiRes);
    assert.equal(geminiRes.status, 200, JSON.stringify(geminiBody));
    assert.equal(geminiCalled, true);
    assert.equal((geminiBody.match as { productId: string }).productId, "product-2");
    assert.equal((geminiBody.match as { provider: string }).provider, "gemini");
    assert.equal(
      (geminiBody.match as { detectedLabel: string }).detectedLabel,
      "ماسك ألو إيفا بالصبار",
    );
    assert.equal(
      (geminiBody.vision as { geminiConfigured: boolean }).geminiConfigured,
      true,
    );
    assert.ok(
      ((geminiBody.match as { candidates?: unknown[] }).candidates ?? []).length >
        0,
      "The endpoint must return text-scored alternatives for review.",
    );

    // A hallucinated id falls back to the label text read from the pack.
    globalThis.fetch = (async () =>
      geminiReply({
        productId: "ghost-product",
        confidence: "high",
        detectedLabel: "ماسك ألو إيفا بالصبار",
        detectedBrand: "إيفا",
      })) as typeof fetch;
    const ghostRes = await postVisionMatch(
      context(
        new MockDatabase(),
        url,
        { method: "POST", body: visionForm("IMG_7777.jpg") },
        { GEMINI_API_KEY: "test-key" },
      ),
    );
    const ghostBody = await json(ghostRes);
    assert.equal(
      (ghostBody.match as { productId: string }).productId,
      "product-2",
      "An unknown model id must be resolved from the detected label.",
    );
    assert.match(
      String(ghostBody.note),
      /لم يكن في الكتالوج/,
      "The response must explain the label-based fallback.",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  // Workers AI is the fallback provider when Gemini is not configured.
  const aiRes = await postVisionMatch(
    context(
      new MockDatabase(),
      url,
      { method: "POST", body: visionForm("IMG_9001.jpg") },
      {
        AI: {
          run: async (model: string) => {
            assert.equal(model, "@cf/meta/llama-3.2-11b-vision-instruct");
            return {
              response: JSON.stringify({
                productId: "product-3",
                confidence: "medium",
                detectedLabel: "عطر العنبر الملكي",
                detectedBrand: "الرحمة",
                detectedType: "عطر",
              }),
            };
          },
        },
      },
    ),
  );
  const aiBody = await json(aiRes);
  assert.equal(aiRes.status, 200, JSON.stringify(aiBody));
  assert.equal((aiBody.match as { productId: string }).productId, "product-3");
  assert.equal((aiBody.match as { provider: string }).provider, "workers-ai");
  assert.equal((aiBody.match as { confidence: string }).confidence, "medium");
  assert.equal(
    (aiBody.vision as { workersAiBound: boolean }).workersAiBound,
    true,
  );

  // JSON input with a data URL is supported.
  const jsonRes = await postVisionMatch(
    context(new MockDatabase(), url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageDataUrl: tinyPngDataUrl(),
        fileName: "vatika-shampoo-olive.jpg",
      }),
    }),
  );
  const jsonBody = await json(jsonRes);
  assert.equal(jsonRes.status, 200, JSON.stringify(jsonBody));
  assert.equal((jsonBody.match as { productId: string }).productId, "product-1");

  // Invalid inputs.
  const badImageRes = await postVisionMatch(
    context(new MockDatabase(), url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageDataUrl: "data:text/plain;base64,QUJD" }),
    }),
  );
  assert.equal(badImageRes.status, 415);

  const missingImageRes = await postVisionMatch(
    context(new MockDatabase(), url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }),
  );
  assert.equal(missingImageRes.status, 400);

  const missingFileRes = await postVisionMatch(
    context(new MockDatabase(), url, {
      method: "POST",
      body: new FormData(),
    }),
  );
  assert.equal(missingFileRes.status, 400);

  const wrongTypeRes = await postVisionMatch(
    context(new MockDatabase(), url, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "hello",
    }),
  );
  assert.equal(wrongTypeRes.status, 415);
}

async function testCommitMatchEndpoint() {
  const url = "https://example.test/api/assets/commit-match";
  const commit = (
    database: MockDatabase,
    body: Record<string, unknown>,
    envExtra: Record<string, unknown> = {},
  ) =>
    postCommitMatch(
      context(
        database,
        url,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        envExtra,
      ),
    );

  // Happy path: review-approved match stored as the verified primary image.
  const commitDb = new MockDatabase();
  const commitRes = await commit(commitDb, {
    productId: "product-1",
    imageDataUrl: tinyPngDataUrl(),
    autoCutout: false,
  });
  const commitBody = await json(commitRes);
  assert.equal(commitRes.status, 200, JSON.stringify(commitBody));
  assert.equal(commitBody.success, true);
  assert.equal(
    (commitBody.product as { verification_status: string }).verification_status,
    "verified",
  );
  assert.equal((commitBody.asset as { storage: string }).storage, "embedded");
  assert.equal(
    (commitBody.provenance as { quality_gate_ready: boolean })
      .quality_gate_ready,
    false,
  );
  assert.ok(
    commitDb.calls.some((call) =>
      call.sql.includes("UPDATE product_assets SET is_primary = 0"),
    ),
    "Committing a match must demote the previous primary without deleting it.",
  );
  const commitAssetInsert = commitDb.calls.find((call) =>
    call.sql.includes("INSERT INTO product_assets"),
  );
  assert.ok(commitAssetInsert);
  assert.ok(
    String(commitAssetInsert?.values[2]).startsWith("data:image/png;base64,"),
  );
  assert.ok(
    commitDb.calls.some((call) =>
      call.sql.includes("verification_status = 'verified'"),
    ),
  );
  assert.equal(
    commitDb.calls.filter((call) =>
      call.sql.includes("INSERT INTO product_research_claims"),
    ).length,
    0,
    "The vision flow must never invent benefit claims.",
  );

  // A real source URL is recorded as verified provenance for the quality gate.
  const sourceDb = new MockDatabase();
  const sourceRes = await commit(sourceDb, {
    productId: "product-2",
    imageDataUrl: tinyPngDataUrl(),
    autoCutout: false,
    sourceUrl: "https://example.test/official-mask",
  });
  const sourceBody = await json(sourceRes);
  assert.equal(sourceRes.status, 200, JSON.stringify(sourceBody));
  assert.equal(
    (sourceBody.provenance as { quality_gate_ready: boolean })
      .quality_gate_ready,
    true,
  );
  assert.ok(
    sourceDb.calls.some((call) =>
      call.sql.includes("INSERT INTO product_information_sources"),
    ),
  );

  // BRIA cutout applied.
  const cutoutDb = new MockDatabase();
  const cutoutRes = await commit(
    cutoutDb,
    {
      productId: "product-1",
      imageDataUrl: tinyPngDataUrl(),
      autoCutout: true,
    },
    {
      AI: {
        run: async () => ({ image: TINY_PNG_BASE64 }),
      },
    },
  );
  const cutoutBody = await json(cutoutRes);
  assert.equal(cutoutRes.status, 200, JSON.stringify(cutoutBody));
  assert.equal((cutoutBody.cutout as { applied: boolean }).applied, true);
  assert.equal(
    (cutoutBody.asset as { content_type: string }).content_type,
    "image/png",
  );

  // Cutout requested without a bound model -> keep the original photo.
  const fallbackRes = await commit(new MockDatabase(), {
    productId: "product-1",
    imageDataUrl: tinyPngDataUrl(),
    autoCutout: true,
  });
  const fallbackBody = await json(fallbackRes);
  assert.equal(fallbackRes.status, 200);
  assert.equal((fallbackBody.cutout as { applied: boolean }).applied, false);
  assert.ok((fallbackBody.cutout as { note: string | null }).note);

  // Unknown product -> 404 without touching assets.
  const missingDb = new MockDatabase();
  const missingRes = await commit(missingDb, {
    productId: "missing",
    imageDataUrl: tinyPngDataUrl(),
    autoCutout: false,
  });
  assert.equal(missingRes.status, 404);
  assert.equal(
    missingDb.calls.filter((call) =>
      call.sql.includes("INSERT INTO product_assets"),
    ).length,
    0,
  );

  // Invalid inputs.
  const noProductRes = await commit(new MockDatabase(), {
    imageDataUrl: tinyPngDataUrl(),
  });
  assert.equal(noProductRes.status, 400);

  const badImageRes = await commit(new MockDatabase(), {
    productId: "product-1",
    imageDataUrl: "data:text/plain;base64,QUJD",
  });
  assert.equal(badImageRes.status, 415);

  const claimsRes = await commit(new MockDatabase(), {
    productId: "product-1",
    imageDataUrl: tinyPngDataUrl(),
    autoCutout: false,
    benefits: ["ترطيب عميق"],
  });
  assert.equal(claimsRes.status, 400);

  const malformedRes = await postCommitMatch(
    context(new MockDatabase(), url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not-json",
    }),
  );
  assert.equal(malformedRes.status, 400);

  const multipartRes = await postCommitMatch(
    context(new MockDatabase(), url, {
      method: "POST",
      body: new FormData(),
    }),
  );
  assert.equal(multipartRes.status, 415);
}

async function run() {
  // --- Existing read endpoints ------------------------------------------------
  const database = new MockDatabase();
  const filteredResponse = await getProducts(
    context(
      database,
      "https://example.test/api/db/products?q=shampoo&brand=vatika&status=needs_verification&category=shampoo&limit=50&offset=50",
    ),
  );
  const filtered = await json(filteredResponse);

  assert.equal(filteredResponse.status, 200);
  assert.equal(
    filteredResponse.headers.get("Cache-Control"),
    "no-store, max-age=0, must-revalidate",
    "Product reads must never serve stale gallery data.",
  );
  assert.equal(filtered.total, 177);
  assert.equal(filtered.limit, 50);
  assert.equal(filtered.offset, 50);
  assert.equal(filtered.hasMore, true);

  const pageQuery = database.calls.find((call) =>
    call.sql.includes("LIMIT ? OFFSET ?"),
  );
  assert.ok(pageQuery);
  assert.deepEqual(pageQuery.values, [
    "%shampoo%",
    "%shampoo%",
    "%shampoo%",
    "%shampoo%",
    "%shampoo%",
    "vatika",
    "needs_verification",
    "shampoo",
    50,
    50,
  ]);
  assert.ok(pageQuery.sql.includes("pa.image_type = 'reference'"));

  const invalidDatabase = new MockDatabase();
  const invalidResponse = await getProducts(
    context(invalidDatabase, "https://example.test/api/db/products?limit=500"),
  );
  assert.equal(invalidResponse.status, 400);
  assert.equal(invalidDatabase.calls.length, 0);

  const statsResponse = await getStats(
    context(new MockDatabase(), "https://example.test/api/db/stats"),
  );
  const stats = await json(statsResponse);
  assert.equal(statsResponse.status, 200);
  assert.equal(
    statsResponse.headers.get("Cache-Control"),
    "no-store, max-age=0, must-revalidate",
    "Stats must never be cached after a harvest.",
  );
  assert.equal((stats.stats as { products: number }).products, 177);

  const brandsResponse = await getBrands(
    context(new MockDatabase(), "https://example.test/api/db/brands"),
  );
  const brands = await json(brandsResponse);
  assert.equal(brandsResponse.status, 200);
  assert.equal((brands.brands as unknown[]).length, 1);

  const researchDatabase = new MockDatabase();
  const researchResponse = await getResearch(
    context(
      researchDatabase,
      "https://example.test/api/db/research?product_id=product-1",
    ),
  );
  const research = await json(researchResponse);
  assert.equal(researchResponse.status, 200);
  assert.equal(
    (research.research as { product: { id: string } }).product.id,
    "product-1",
  );
  assert.ok(
    researchDatabase.calls.some((call) =>
      call.sql.includes("s.id = c.source_id AND s.product_id = c.product_id"),
    ),
  );
  const researchPayload = research.research as {
    verifiedBenefits: { id: string }[];
    verifiedUsage: { id: string }[];
    unverifiedClaims: { id: string }[];
  };
  assert.deepEqual(
    researchPayload.verifiedBenefits.map((claim) => claim.id),
    ["benefit-verified"],
  );
  assert.deepEqual(
    researchPayload.verifiedUsage.map((claim) => claim.id),
    ["usage-verified"],
  );
  assert.deepEqual(
    researchPayload.unverifiedClaims.map((claim) => claim.id),
    ["usage-unverified"],
  );
  assert.ok(
    researchDatabase.calls.some(
      (call) =>
        call.sql.includes("FROM product_assets") &&
        call.sql.includes("image_type = 'reference'"),
    ),
  );

  const missingProductResponse = await getResearch(
    context(
      new MockDatabase(),
      "https://example.test/api/db/research?product_id=not-found",
    ),
  );
  assert.equal(missingProductResponse.status, 404);

  // --- POST /api/db/research/ingest -----------------------------------------
  const ingestPayload = {
    product_id: "product-1",
    source_name: "Official source",
    source_url: "https://example.test/official",
    source_type: "manufacturer",
    image_url: "https://example.test/packshot.png",
    verified_claims: [
      { claim_type: "benefit", claim_text: "Verified benefit" },
      { claim_type: "usage", claim_text: "Verified usage" },
      { claim_type: "benefit", claim_text: "Verified benefit" },
    ],
    warehouse_stock_status: "in_stock",
  };

  const ingestDatabase = new MockDatabase();
  const ingestResponse = await postResearchIngest(
    context(
      ingestDatabase,
      "https://example.test/api/db/research/ingest",
      {
        method: "POST",
        body: JSON.stringify(ingestPayload),
      },
    ),
  );
  const ingest = await json(ingestResponse);

  assert.equal(ingestResponse.status, 200);
  assert.equal(ingest.success, true);
  assert.equal(
    (ingest.product as { verification_status: string }).verification_status,
    "verified",
  );
  assert.equal(
    (ingest.claims as { inserted: number }).inserted,
    2,
    "Duplicate claim in the payload must be skipped.",
  );
  assert.equal((ingest.claims as { skipped: number }).skipped, 1);
  assert.equal(ingest.warehouseStockCheckRecorded, true);

  const ingestSql = ingestDatabase.calls.map((call) => call.sql);
  assert.ok(
    ingestSql.some((sql) => sql.includes("INSERT INTO product_information_sources")),
  );
  assert.equal(
    ingestSql.filter((sql) => sql.includes("INSERT INTO product_research_claims")).length,
    2,
  );
  assert.ok(
    ingestSql.some(
      (sql) =>
        sql.includes("UPDATE product_assets SET is_primary = 0") &&
        sql.includes("id != ?"),
    ),
    "Previous primary assets must be demoted, not deleted.",
  );
  assert.ok(ingestSql.some((sql) => sql.includes("INSERT INTO product_assets")));
  assert.ok(
    ingestSql.some((sql) => sql.includes("INSERT INTO warehouse_stock_checks")),
  );
  const productUpdate = ingestDatabase.calls.find((call) =>
    call.sql.includes("UPDATE products"),
  );
  assert.ok(productUpdate);
  assert.ok(productUpdate.sql.includes("verification_status = 'verified'"));
  assert.deepEqual(productUpdate.values.slice(-2), [
    "in_stock",
    "product-1",
  ] as BoundValue[]);

  const invalidIngestDatabase = new MockDatabase();
  const invalidIngestResponse = await postResearchIngest(
    context(
      invalidIngestDatabase,
      "https://example.test/api/db/research/ingest",
      {
        method: "POST",
        body: JSON.stringify({
          ...ingestPayload,
          image_url: "not-a-url",
          verified_claims: [{ claim_type: "medical", claim_text: "Nope" }],
        }),
      },
    ),
  );
  assert.equal(invalidIngestResponse.status, 400);
  assert.equal(
    invalidIngestDatabase.calls.length,
    0,
    "Validation must short-circuit before touching D1.",
  );

  const notJsonResponse = await postResearchIngest(
    context(
      new MockDatabase(),
      "https://example.test/api/db/research/ingest",
      { method: "POST", body: "{not-json" },
    ),
  );
  assert.equal(notJsonResponse.status, 400);

  const missingIngestProductResponse = await postResearchIngest(
    context(
      new MockDatabase(),
      "https://example.test/api/db/research/ingest",
      {
        method: "POST",
        body: JSON.stringify({ ...ingestPayload, product_id: "missing" }),
      },
    ),
  );
  assert.equal(missingIngestProductResponse.status, 404);

  // --- Admin auth middleware -------------------------------------------------
  // GET passes through
  const getCtx = {
    request: new Request("https://example.test/api/db/products"),
    env: { DB: new MockDatabase() },
    next: async () => new Response(JSON.stringify({ success: true }), { status: 200 }),
  } as any;
  const getPass = await adminMiddleware(getCtx);
  assert.equal(getPass.status, 200);
  assert.equal(getPass.headers.get("X-Auth-Mode"), null);

  // Unconfigured preview: write allowed + warning header
  const unconfiguredCtx = {
    request: new Request("https://example.test/api/db/research/ingest", { method: "POST" }),
    env: { DB: new MockDatabase() },
    next: async () => new Response(JSON.stringify({ success: true }), { status: 200 }),
  } as any;
  const unconfigured = await adminMiddleware(unconfiguredCtx);
  assert.equal(unconfigured.status, 200);
  assert.equal(unconfigured.headers.get("X-Auth-Mode"), "unconfigured-preview");

  // Configured but wrong/missing key => 401
  const badKeyCtx = {
    request: new Request("https://example.test/api/db/research/ingest", {
      method: "POST",
      headers: { "X-Admin-Key": "wrong" },
    }),
    env: { DB: new MockDatabase(), ADMIN_API_KEY: "secret-key" },
    next: async () => new Response(JSON.stringify({ success: true }), { status: 200 }),
  } as any;
  const denied = await adminMiddleware(badKeyCtx);
  assert.equal(denied.status, 401);
  const deniedBody = await json(denied);
  assert.equal(deniedBody.success, false);
  assert.equal(denied.headers.get("X-Auth-Mode"), "configured");

  const missingKeyCtx = {
    request: new Request("https://example.test/api/db/research/ingest", { method: "POST" }),
    env: { DB: new MockDatabase(), ADMIN_API_KEY: "secret-key" },
    next: async () => new Response(JSON.stringify({ success: true }), { status: 200 }),
  } as any;
  const deniedMissing = await adminMiddleware(missingKeyCtx);
  assert.equal(deniedMissing.status, 401);

  // Configured and correct key => passes through
  const okKeyCtx = {
    request: new Request("https://example.test/api/db/research/ingest", {
      method: "POST",
      headers: { "X-Admin-Key": "secret-key" },
    }),
    env: { DB: new MockDatabase(), ADMIN_API_KEY: "secret-key" },
    next: async () => new Response(JSON.stringify({ success: true }), { status: 200 }),
  } as any;
  const allowed = await adminMiddleware(okKeyCtx);
  assert.equal(allowed.status, 200);

  // Asset uploads are writes: protected when the key is configured…
  for (const path of [
    "/api/assets/upload",
    "/api/assets/vision-match",
    "/api/assets/commit-match",
  ]) {
    const denied = await adminMiddleware({
      request: new Request(`https://example.test${path}`, { method: "POST" }),
      env: { DB: new MockDatabase(), ADMIN_API_KEY: "secret-key" },
      next: async () =>
        new Response(JSON.stringify({ success: true }), { status: 200 }),
    } as any);
    assert.equal(denied.status, 401, `${path} must require the admin key`);
  }

  // …and tagged in preview mode so the dashboard can warn.
  const assetPreview = await adminMiddleware({
    request: new Request("https://example.test/api/assets/upload", {
      method: "POST",
    }),
    env: { DB: new MockDatabase() },
    next: async () =>
      new Response(JSON.stringify({ success: true }), { status: 200 }),
  } as any);
  assert.equal(assetPreview.status, 200);
  assert.equal(
    assetPreview.headers.get("X-Auth-Mode"),
    "unconfigured-preview",
  );

  const visionPreview = await adminMiddleware({
    request: new Request("https://example.test/api/assets/vision-match", {
      method: "POST",
    }),
    env: { DB: new MockDatabase() },
    next: async () =>
      new Response(JSON.stringify({ success: true }), { status: 200 }),
  } as any);
  assert.equal(
    visionPreview.headers.get("X-Auth-Mode"),
    "unconfigured-preview",
  );

  // Asset reads stay public.
  const assetRead = await adminMiddleware({
    request: new Request("https://example.test/api/assets/catalog"),
    env: { DB: new MockDatabase() },
    next: async () =>
      new Response(JSON.stringify({ success: true }), { status: 200 }),
  } as any);
  assert.equal(assetRead.headers.get("X-Auth-Mode"), null);

  // --- Promos ----------------------------------------------------------------
  const promosDb = new MockDatabase();
  const promosGet = await getPromos(
    context(promosDb, "https://example.test/api/db/promos?product_id=product-1"),
  );
  const promosBody = await json(promosGet);
  assert.equal(promosGet.status, 200);
  assert.equal(promosBody.success, true);
  assert.ok(Array.isArray(promosBody.promos));

  const promoPostDb = new MockDatabase();
  const promoPost = await postPromos(
    context(
      promoPostDb,
      "https://example.test/api/db/promos",
      {
        method: "POST",
        body: JSON.stringify({
          product_id: "product-1",
          original_price: 200,
          discount_percent: 25,
          starts_at: "2026-11-01",
          ends_at: "2026-11-30",
        }),
      },
    ),
  );
  const promoBody = await json(promoPost);
  assert.equal(promoPost.status, 200);
  assert.equal(promoBody.success, true);
  const promoSql = promoPostDb.calls.map((c) => c.sql);
  assert.ok(
    promoSql.some((sql) => sql.includes("UPDATE product_promotions SET is_active = 0")),
    "Previous active promos must be deactivated, not deleted.",
  );
  assert.ok(
    promoSql.some((sql) => sql.includes("INSERT INTO product_promotions")),
  );

  // promo validation: bad dates
  const badPromo = await postPromos(
    context(new MockDatabase(), "https://example.test/api/db/promos", {
      method: "POST",
      body: JSON.stringify({
        product_id: "product-1",
        original_price: 200,
        discount_percent: 25,
        starts_at: "2026-12-01",
        ends_at: "2026-11-01",
      }),
    }),
  );
  assert.equal(badPromo.status, 400);

  // --- Calendar --------------------------------------------------------------
  const calendarGet = await getCalendar(
    context(new MockDatabase(), "https://example.test/api/db/calendar"),
  );
  const calendarBody = await json(calendarGet);
  assert.equal(calendarGet.status, 200);
  assert.equal(calendarBody.success, true);
  assert.ok(Array.isArray(calendarBody.occasions));

  const toggleDb = new MockDatabase();
  const toggleRes = await postCalendar(
    context(toggleDb, "https://example.test/api/db/calendar", {
      method: "POST",
      body: JSON.stringify({ action: "toggle", id: "cc-eg-ramadan", is_active: false }),
    }),
  );
  assert.equal(toggleRes.status, 200);
  assert.ok(
    toggleDb.calls.some((c) => c.sql.includes("UPDATE cultural_calendar SET is_active")),
  );

  const notFoundToggle = await postCalendar(
    context(new MockDatabase(), "https://example.test/api/db/calendar", {
      method: "POST",
      body: JSON.stringify({ action: "toggle", id: "missing", is_active: false }),
    }),
  );
  assert.equal(notFoundToggle.status, 404);

  // --- Bulk ingest -----------------------------------------------------------
  const bulkDb = new MockDatabase();
  const bulkRes = await postBulkIngest(
    context(bulkDb, "https://example.test/api/db/research/bulk-ingest", {
      method: "POST",
      body: JSON.stringify({
        records: [
          {
            ...ingestPayload,
            verified_claims: [{ claim_type: "benefit", claim_text: "Bulk benefit" }],
          },
        ],
      }),
    }),
  );
  const bulkBody = await json(bulkRes);
  assert.equal(bulkRes.status, 200);
  assert.equal(bulkBody.success, true);
  assert.equal(bulkBody.total, 1);
  assert.equal(bulkBody.failed, 0);

  // reject empty / oversized
  const emptyBulk = await postBulkIngest(
    context(new MockDatabase(), "https://example.test/api/db/research/bulk-ingest", {
      method: "POST",
      body: JSON.stringify({ records: [] }),
    }),
  );
  assert.equal(emptyBulk.status, 400);

  // reject missing product in bulk
  const missingBulk = await postBulkIngest(
    context(new MockDatabase(), "https://example.test/api/db/research/bulk-ingest", {
      method: "POST",
      body: JSON.stringify({
        records: [{ ...ingestPayload, product_id: "missing" }],
      }),
    }),
  );
  assert.equal(missingBulk.status, 404);

  // --- Campaigns -------------------------------------------------------------
  await testCampaignEndpoints();
  await testCompositeCampaignWiring();

  // --- Product asset uploader -------------------------------------------------
  await testFilenameMatching();
  await testAssetEndpoints();

  // --- Smart vision asset matcher --------------------------------------------
  await testVisionEndpoints();
  await testCommitMatchEndpoint();

  // --- Lightweight client guard (server-side bg removal) --------------------
  const repoRoot = process.cwd();
  const pkgJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  assert.equal(
    Boolean(pkgJson.dependencies?.["@imgly/background-removal"] || pkgJson.devDependencies?.["@imgly/background-removal"]),
    false,
    "@imgly/background-removal must not be present in package dependencies.",
  );
  const exportSource = readFileSync(join(repoRoot, "src/lib/al-rahma/export.ts"), "utf8");
  assert.equal(exportSource.includes("@imgly/background-removal"), false, "Client export must not import @imgly/background-removal.");

  console.log(
    "D1 API tests passed: pagination, filters, validation, stats, brands, research, ingest, admin auth 401/unconfigured-preview, promos, 48h calendar, bulk ingest, campaign random selection + verified primary assets, product asset upload (R2/embedded, cutout fallback, grounded claims, filename matching), smart vision matching (Gemini, Workers AI, label and filename fallbacks), commit-match (verified primary image, BRIA cutout, provenance), socialCaption, and batch run/persistence.",
  );
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
