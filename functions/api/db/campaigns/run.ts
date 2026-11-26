import { z } from "zod";
import { cairoToday, daysBetween, nextOccurrenceInWindow } from "../../_dates";
import {
  ProductionEngine,
  buildOccasionGreeting,
  isSafeOfferText,
  sanitizeOfferText,
  type OccasionGreetingInput,
  type ProductDetails,
  type PromotionRecord,
} from "../../../../src/lib/al-rahma";
import { creativeSlotRecipe } from "../../../../src/lib/al-rahma/design-library";
import { parseProductVisualBrief } from "../../../../src/lib/al-rahma/product-visual-brief";
import { removePackshotBackgroundServer } from "../../ai/remove-bg";
import { compositeProductScene } from "../../ai/product-composite";
import {
  generateBackgroundWithNanoBananaDetailed,
  type NanoBananaStageProvider,
} from "../../ai/nano-banana-stage";
import {
  ART_DIRECTION_STYLES,
  generateArtDirectedScene,
  variantStylePair,
  type ArtDirectionStyleId,
  type SceneProvider,
} from "../../ai/studio-scene";
import {
  resolveTenantScope,
  authenticateLockedTenant,
  leaseGenerationSlot,
  releaseGenerationSlot,
  recordGeneration,
  productOfferSettingKey,
} from "../../_tenant";

/**
 * POST /api/db/campaigns/run (protected by admin middleware)
 *
 * Modes:
 * - Basic: { mode: "basic", count?: 1..100, productIds?: string[] } ->
 *   generates exactly 2 creatives per selected product from the sequential,
 *   not-yet-advertised queue.
 * - Batch (legacy): { limit?: 1..5 } -> generates full campaign in one call.
 * - Plan: { planOnly: true, limit?: 1..5 } -> selects eligible products/slots,
 *   creates a campaign in "planned" state, returns the execution plan.
 * - Single slot: { campaignId?, productId, variantIndex, conditioningImage? }
 *   -> generates one variant for one product, appends creatives to the campaign
 *   (creating it if needed), and persists immediately.
 *
 * No Cloudflare Cron is enabled by this endpoint.
 */

interface Env {
  DB: D1Database;
  REQUIRE_ACCESS_KEY?: string;
  AI?: {
    run: (model: string, input: Record<string, unknown>) => Promise<unknown>;
  };
  REMOVE_BG_API_KEY?: string;
  GEMINI_API_KEY?: string;
  HF_TOKEN?: string;
  HF_COMPOSITE_MODEL?: string;
}

interface EligibleProductRow {
  id: string;
  name_arabic: string;
  name_english: string | null;
  category: string | null;
  verification_status: string;
  warehouse_stock_status: string | null;
  last_advertised_at: number | null;
  description: string | null;
  price: number | null;
  image_url: string;
  image_source: string | null;
  brand_arabic: string;
  brand_slug: string;
}

interface SourceRow {
  source_url: string;
  source_name: string | null;
  verification_status: string;
}

interface ClaimRow {
  claim_type: "benefit" | "usage";
  claim_text: string;
  claim_verification_status: string;
  source_verification_status: string;
}

interface PromotionRow {
  id: string;
  product_id: string;
  original_price: number;
  discount_percent: number;
  promo_price: number;
  starts_at: string;
  ends_at: string;
  is_active: number;
}

interface CalendarRow {
  id: string;
  country_code: string;
  occasion_name_arabic: string;
  greeting_text_arabic: string;
  occasion_date: string;
  next_occurrence: string | null;
  lead_days: number;
  accent_theme: string | null;
  is_active: number;
  days_until: number | null;
}

const basicSchema = z
  .object({
    mode: z.literal("basic"),
    count: z.number().int().min(1).max(100).optional(),
    productIds: z
      .array(z.string().trim().min(1).max(100))
      .min(1)
      .max(100)
      .optional(),
  })
  .strict();

const batchSchema = z
  .object({ limit: z.number().int().min(1).max(5).optional() })
  .strict();

const planSchema = z
  .object({
    planOnly: z.literal(true),
    limit: z.number().int().min(1).max(5).optional(),
  })
  .strict();

const singleSchema = z
  .object({
    campaignId: z.string().min(1).optional(),
    productId: z.string().min(1),
    variantIndex: z.number().int().min(1).max(2),
    conditioningImage: z.string().min(1).optional(),
  })
  .strict();

type RequestMode =
  | { mode: "basic"; count: number; productIds?: string[] }
  | { mode: "batch"; limit: number }
  | { mode: "plan"; limit: number }
  | { mode: "single"; campaignId?: string; productId: string; variantIndex: 1 | 2; conditioningImage?: string };

function parseRequest(payload: unknown): RequestMode | null {
  const basic = basicSchema.safeParse(payload);
  if (basic.success) {
    return {
      mode: "basic",
      count: basic.data.count ?? 5,
      productIds: basic.data.productIds,
    };
  }

  const plan = planSchema.safeParse(payload);
  if (plan.success) return { mode: "plan", limit: plan.data.limit ?? 5 };

  const single = singleSchema.safeParse(payload);
  if (single.success) {
    return {
      mode: "single",
      campaignId: single.data.campaignId,
      productId: single.data.productId,
      variantIndex: single.data.variantIndex as 1 | 2,
      conditioningImage: single.data.conditioningImage,
    };
  }

  // Batch: accepts undefined/{} or {limit}
  if (payload === undefined || payload === null || (typeof payload === "object" && !Array.isArray(payload))) {
    const obj = (payload ?? {}) as Record<string, unknown>;
    if (
      "mode" in obj ||
      "planOnly" in obj ||
      "productId" in obj ||
      "variantIndex" in obj ||
      "campaignId" in obj
    ) {
      return null;
    }
    const batch = batchSchema.safeParse(obj);
    if (batch.success) return { mode: "batch", limit: batch.data.limit ?? 5 };
  }
  return null;
}

interface SceneOutcome {
  image: string | null;
  provider: SceneProvider;
  styleId: ArtDirectionStyleId;
  styleLabelAr: string;
  styleLabelEn: string;
  model?: string;
}

async function loadBrandLogoUrl(env: Env): Promise<string | null> {
  try {
    const row = await env.DB.prepare(
      "SELECT value FROM business_settings WHERE key = ? LIMIT 1",
    )
      .bind("brand_logo_url")
      .first<{ value: string | null }>();
    const value = row?.value?.trim();
    return value ? value : null;
  } catch {
    return null;
  }
}

function toPromotionRecord(row: PromotionRow): PromotionRecord {
  return {
    id: row.id,
    product_id: row.product_id,
    original_price: row.original_price,
    discount_percent: row.discount_percent,
    promo_price: row.promo_price,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    is_active: row.is_active,
  };
}

function toOccasionInput(row: CalendarRow | null): OccasionGreetingInput | null {
  if (!row) return null;
  return {
    id: row.id,
    occasionName: row.occasion_name_arabic,
    greeting: buildOccasionGreeting({
      id: row.id,
      country_code: row.country_code,
      occasion_name_arabic: row.occasion_name_arabic,
      greeting_text_arabic: row.greeting_text_arabic,
      occasion_date: row.occasion_date,
      lead_days: row.lead_days,
      accent_theme: row.accent_theme,
      is_active: row.is_active,
    }),
    occasionDate: row.next_occurrence ?? row.occasion_date,
    daysUntil: row.days_until ?? undefined,
    accentTheme: row.accent_theme,
  };
}

async function loadActiveOccasion(env: Env): Promise<OccasionGreetingInput | null> {
  const today = cairoToday();
  const rows = await env.DB.prepare(
    `SELECT id, country_code, occasion_name_arabic, greeting_text_arabic,
            occasion_date, lead_days, accent_theme, is_active
     FROM cultural_calendar
     WHERE country_code = 'EG' AND is_active = 1`,
  ).all<Omit<CalendarRow, "next_occurrence" | "days_until">>();

  let best: (CalendarRow & { days_until: number }) | null = null;
  for (const row of rows.results) {
    const occurrence = nextOccurrenceInWindow(
      row.occasion_date,
      today,
      row.lead_days ?? 2,
    );
    if (!occurrence) continue;
    const daysUntil = Math.max(0, daysBetween(today, occurrence));
    const candidate = {
      ...row,
      next_occurrence: occurrence,
      days_until: daysUntil,
    };
    if (!best || daysUntil < best.days_until) {
      best = candidate;
    }
  }

  return toOccasionInput(best);
}

async function loadActivePromotion(
  env: Env,
  productId: string,
  today: string,
): Promise<PromotionRecord | null> {
  const row = await env.DB.prepare(
    `SELECT id, product_id, original_price, discount_percent, promo_price,
            starts_at, ends_at, is_active
     FROM product_promotions
     WHERE product_id = ? AND is_active = 1
       AND starts_at <= ? AND ends_at >= ?
     ORDER BY created_at DESC
     LIMIT 1`,
  )
    .bind(productId, today, today)
    .first<PromotionRow>();
  return row ? toPromotionRecord(row) : null;
}

async function loadResearch(env: Env, productId: string) {
  const [sources, claims] = await Promise.all([
    env.DB.prepare(
      `SELECT source_url, source_name, verification_status
       FROM product_information_sources
       WHERE product_id = ?
       ORDER BY retrieved_at DESC`,
    )
      .bind(productId)
      .all<SourceRow>(),
    env.DB.prepare(
      `SELECT c.claim_type, c.claim_text,
              c.verification_status AS claim_verification_status,
              s.verification_status AS source_verification_status
       FROM product_research_claims c
       JOIN product_information_sources s
         ON s.id = c.source_id AND s.product_id = c.product_id
       WHERE c.product_id = ?`,
    )
      .bind(productId)
      .all<ClaimRow>(),
  ]);

  const verifiedSource = sources.results.find(
    (s) => s.verification_status === "verified",
  );
  const verifiedBenefits = claims.results
    .filter(
      (c) =>
        c.claim_type === "benefit" &&
        c.claim_verification_status === "verified" &&
        c.source_verification_status === "verified",
    )
    .map((c) => c.claim_text);
  const verifiedUsage = claims.results
    .filter(
      (c) =>
        c.claim_type === "usage" &&
        c.claim_verification_status === "verified" &&
        c.source_verification_status === "verified",
    )
    .map((c) => c.claim_text);

  return {
    sourceUrl: verifiedSource?.source_url,
    verifiedBenefits,
    verifiedUsage,
  };
}

const ELIGIBLE_PRODUCT_COLUMNS = `p.id, p.name_arabic, p.name_english, p.category,
       p.verification_status, p.warehouse_stock_status, p.last_advertised_at,
       p.description, p.price, pa.image_url, pa.source_url AS image_source,
       b.name_arabic AS brand_arabic, b.slug AS brand_slug`;

const VERIFIED_ASSET_JOIN = `JOIN brands b ON b.id = p.brand_id
     JOIN product_assets pa
       ON pa.product_id = p.id
      AND pa.image_type = 'reference'
      AND pa.is_primary = 1
      AND pa.verification_status = 'verified'
      AND pa.image_url IS NOT NULL
      AND TRIM(pa.image_url) != ''`;

/**
 * Sequential, non-repeating queue. `last_advertised_at` is the persisted D1
 * marker; no new table or migration is required. Explicit selections are
 * handled separately because operators may target a specific product.
 */
async function selectEligibleProducts(
  env: Env,
  limit: number,
  tenantId: string | null = null,
  onlyUnadvertised = true,
): Promise<EligibleProductRow[]> {
  const eligible = await env.DB.prepare(
    `SELECT ${ELIGIBLE_PRODUCT_COLUMNS}
     FROM products p
     ${VERIFIED_ASSET_JOIN}
     WHERE p.verification_status = 'verified'
       ${onlyUnadvertised ? "AND p.last_advertised_at IS NULL" : ""}
       ${tenantId ? "AND p.tenant_key_id = ?" : ""}
       ${tenantId ? "AND pa.tenant_key_id = ?" : ""}
     ORDER BY p.created_at ASC, p.id ASC
     LIMIT ?`,
  )
    .bind(...(tenantId ? [tenantId, tenantId, limit] : [limit]))
    .all<EligibleProductRow>();
  return eligible.results;
}

async function loadEligibleProductById(env: Env, productId: string, tenantId: string | null = null): Promise<EligibleProductRow | null> {
  const row = await env.DB.prepare(
    `SELECT ${ELIGIBLE_PRODUCT_COLUMNS}
     FROM products p
     ${VERIFIED_ASSET_JOIN}
     WHERE p.verification_status = 'verified' AND p.id = ?
       ${tenantId ? "AND p.tenant_key_id = ? AND pa.tenant_key_id = ?" : ""}
     LIMIT 1`,
  )
    .bind(...(tenantId ? [productId, tenantId, tenantId] : [productId]))
    .first<EligibleProductRow>();
  return row ?? null;
}

interface ExplicitSelectionResult {
  products: EligibleProductRow[];
  alreadyGenerated: string[];
  missing: string[];
}

/** Loads an explicit operator selection, refusing any already-generated id. */
async function loadExplicitProducts(
  env: Env,
  productIds: string[],
  tenantId: string | null,
): Promise<ExplicitSelectionResult> {
  if (productIds.length === 0) {
    return { products: [], alreadyGenerated: [], missing: [] };
  }
  const placeholders = productIds.map(() => "?").join(",");
  const rows = await env.DB.prepare(
    `SELECT ${ELIGIBLE_PRODUCT_COLUMNS}
     FROM products p
     ${VERIFIED_ASSET_JOIN}
     WHERE p.id IN (${placeholders})
       ${tenantId ? "AND p.tenant_key_id = ? AND pa.tenant_key_id = ?" : ""}`,
  )
    .bind(...productIds, ...(tenantId ? [tenantId, tenantId] : []))
    .all<EligibleProductRow>();

  const present = new Map(rows.results.map((row) => [row.id, row]));
  const alreadyGenerated = productIds.filter(
    (id) => present.get(id)?.last_advertised_at != null,
  );
  const missing = productIds.filter((id) => !present.has(id));
  const products = productIds.flatMap((id) => {
    const row = present.get(id);
    return row && row.last_advertised_at == null ? [row] : [];
  });
  return { products, alreadyGenerated, missing };
}

/** Reads optional offer text from existing business_settings (no new columns). */
async function loadOfferTexts(
  env: Env,
  productIds: string[],
  tenantId: string | null,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (productIds.length === 0) return result;
  const keys = productIds.map((id) => productOfferSettingKey(tenantId, id));
  const placeholders = keys.map(() => "?").join(",");
  const rows = await env.DB.prepare(
    `SELECT key, value FROM business_settings WHERE key IN (${placeholders})`,
  )
    .bind(...keys)
    .all<{ key: string; value: string | null }>();
  const byKey = new Map(rows.results.map((row) => [row.key, row.value]));
  for (const id of productIds) {
    const value = byKey.get(productOfferSettingKey(tenantId, id));
    if (isSafeOfferText(value)) result.set(id, sanitizeOfferText(value));
  }
  return result;
}

type VariantIndex = 1 | 2;

async function generateSlotCreative(
  env: Env,
  product: EligibleProductRow,
  variantIndex: VariantIndex,
  opts: {
    today: string;
    now: number;
    occasion: OccasionGreetingInput | null;
    brandLogoUrl: string | null;
    conditioningImage?: string | null;
    tenantIndustry?: string | null;
    tenantBrand?: { brandName?: string | null; industry?: string | null; logoUrl?: string | null } | null;
    salesLine?: string | null;
    price?: number | null;
    offerText?: string | null;
  },
): Promise<{ creative: Record<string, unknown>; selectedId: string; stageProvider: NanoBananaStageProvider }> {
  const {
    today,
    now,
    occasion,
    brandLogoUrl,
    conditioningImage,
    tenantIndustry,
    tenantBrand,
    salesLine,
    price,
    offerText,
  } = opts;
  const seedBase = Array.from(product.id).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const [style1, style2] = variantStylePair(product.id);
  const [promotion, research] = await Promise.all([
    loadActivePromotion(env, product.id, today),
    loadResearch(env, product.id),
  ]);

  let cutoutImage: string | null = null;
  try {
    cutoutImage = await removePackshotBackgroundServer(env, product.image_url);
  } catch (error) {
    console.error("Server-side packshot cutout failed, using original image.", error);
  }
  const cutoutApplied = Boolean(cutoutImage);
  const productImageUrl = cutoutImage ?? product.image_url;

  // The brief is reconstructed from existing product metadata; vision-derived
  // fields are added by the upload stage when available. Claims stay guarded.
  const visualBrief = parseProductVisualBrief(
    {
      identity: product.name_arabic,
      category: product.category ?? "general",
      industry: tenantIndustry ?? "general",
      shortSalesLine: salesLine ?? product.description ?? "",
    },
    "ar",
    {
      identity: product.name_arabic,
      category: product.category ?? "general",
      industry: tenantIndustry ?? "general",
    },
  );

  const sceneContext = {
    brand: product.brand_arabic,
    industry: tenantIndustry,
    category: product.category,
    name: product.name_arabic,
    benefits: research.verifiedBenefits,
    visualBrief,
  };

  const styles: [ArtDirectionStyleId, ArtDirectionStyleId] = [style1, style2];
  const targetStyle = styles[variantIndex - 1];
  const designSlot: 1 | 2 = variantIndex;
  const designRecipe = creativeSlotRecipe(designSlot);

  // Conditioning image (client-built 768x1344 canvas with BRIA cutout placed
  // at hero position) is the preferred reference for img2img so the model paints
  // the environment around the real bottle; fall back to the authentic photo.
  const compositeReference = conditioningImage?.trim() || product.image_url;

  const composite = await compositeProductScene(env, compositeReference, sceneContext, {
    styleId: targetStyle,
    slot: designSlot,
    textDirection: "rtl",
  });

  let stageProvider: NanoBananaStageProvider = "studio-fallback";
  let stageModel: string | undefined;
  let backgroundImage: string | null = null;
  let scene: SceneOutcome | null = null;

  if (!composite.image) {
    scene = await generateArtDirectedScene(env, targetStyle, sceneContext, {
      seed: seedBase + (variantIndex - 1),
      slot: designSlot,
      textDirection: "rtl",
    });
    if (!scene?.image && env.GEMINI_API_KEY?.trim()) {
      try {
        const staged = await generateBackgroundWithNanoBananaDetailed(
          env,
          ART_DIRECTION_STYLES[targetStyle].template,
          sceneContext,
          { slot: designSlot, textDirection: "rtl" },
        );
        backgroundImage = staged.image;
        stageProvider = staged.provider;
        stageModel = staged.model;
      } catch (error) {
        console.error("Nano Banana background staging failed, falling back to the deterministic studio.", error);
      }
    }
  }

  const details: ProductDetails = {
    title: product.name_arabic,
    category: product.category ?? "",
    sourceUrl: research.sourceUrl ?? product.image_source ?? undefined,
    verificationStatus: product.verification_status,
    verifiedBenefits: research.verifiedBenefits,
    verifiedUsage: research.verifiedUsage,
    productImageUrl,
    warehouseStockStatus: (product.warehouse_stock_status ?? "unknown") as
      | "in_stock"
      | "out_of_stock"
      | "unknown",
    salesLine: salesLine ?? product.description ?? null,
    visualBrief,
    price: price ?? product.price ?? null,
    offerText: offerText ?? null,
  };

  const sceneImageUrls: { 1?: string | null; 2?: string | null } = {};
  const stagedImageUrls: { 1?: string | null; 2?: string | null } = {};
  const stagedContains: { 1?: boolean; 2?: boolean } = {};
  sceneImageUrls[variantIndex] = backgroundImage ?? scene?.image ?? null;
  stagedImageUrls[variantIndex] = composite.image;
  stagedContains[variantIndex] = Boolean(composite.image);

  const variants = ProductionEngine.executeVariants({
    product: details,
    promotion,
    occasion,
    today,
    brandLogoUrl,
    sceneImageUrls,
    stagedImageUrls,
    stagedImageContainsProductByVariant: stagedContains,
  });

  const variant = variants.find((v) => v.variantNumber === variantIndex) ?? variants[0];
  const creativeId = crypto.randomUUID();
  const qualityStatus = variant.success ? "passed" : "blocked";
  const styleMeta = ART_DIRECTION_STYLES[targetStyle];
  const aiComposite = Boolean(composite.image);
  const aiEngine = aiComposite
    ? composite.provider
    : stageProvider === "nano-banana"
      ? "nano-banana"
      : (scene?.provider ?? "deterministic-studio");
  const aiEngineModel = aiComposite
    ? composite.model
    : stageProvider === "nano-banana"
      ? stageModel
      : scene?.model;
  const backgroundProvider = aiComposite
    ? "reference-conditioned-composite"
    : stageProvider === "nano-banana"
      ? "nano-banana"
      : (scene?.provider ?? "deterministic-studio");

  const artDirection = {
    styleId: targetStyle,
    designSlot,
    designRecipeId: designRecipe.id,
    designRecipeLabelAr: designRecipe.labelAr,
    styleLabelAr: styleMeta.labelAr,
    styleLabelEn: styleMeta.labelEn,
    accent: styleMeta.accent,
    engine: aiEngine,
    ...(aiEngineModel ? { model: aiEngineModel } : {}),
    cutoutApplied,
    stagedProduct: aiComposite,
    backgroundOnly: !aiComposite,
    aiComposite,
    containsProduct: aiComposite,
    usedReference: aiComposite && composite.usedReference,
    compositeProvider: aiComposite ? composite.provider : null,
    compositeModel: aiComposite ? (composite.model ?? null) : null,
    backgroundProvider,
    compositeFallbackReason: !aiComposite ? composite.fallbackReason ?? null : null,
    compositeAttempts: composite.attempts ?? [],
    conditioningCanvas: Boolean(conditioningImage?.trim()),
  };

  const qualityNotes = JSON.stringify({
    score: variant.qualityReport.overallScore,
    blockers: variant.blockers,
    errors: variant.qualityReport.errors,
    warnings: variant.qualityReport.warnings,
    promotion: variant.metadata.promotion,
    occasion: variant.metadata.occasion,
    artDirection,
  });

  const creative = {
    id: creativeId,
    campaign_id: "", // filled by caller
    product_id: product.id,
    product_name_arabic: product.name_arabic,
    brand_arabic: product.brand_arabic,
    brand_slug: product.brand_slug,
    variant_number: variant.variantNumber,
    variant: variant.variant,
    angle: variant.angle,
    style_id: variant.styleId,
    headline_arabic: variant.copy.headline,
    copy_arabic: variant.copy.fullPostText,
    socialCaption: variant.copy.socialCaption,
    quality_status: qualityStatus,
    quality_notes: qualityNotes,
    image_url: variant.svgDataUri,
    svg: variant.svgOverlay,
    success: variant.success,
    blockers: variant.blockers,
    metadata: variant.metadata,
    stageProvider,
    stageModel,
    sceneProvider: scene?.provider ?? "deterministic-studio",
    sceneModel: scene?.model,
    art_direction_style: targetStyle,
    design_slot: designSlot,
    design_recipe_id: designRecipe.id,
    design_recipe_label_ar: designRecipe.labelAr,
    art_direction_label: styleMeta.labelAr,
    art_direction_label_en: styleMeta.labelEn,
    ai_engine: aiEngine,
    ai_engine_model: aiEngineModel,
    cutout_applied: cutoutApplied,
    ai_composite: aiComposite,
    contains_product: aiComposite,
    used_reference: aiComposite && composite.usedReference,
    composite_provider: aiComposite ? composite.provider : null,
    composite_model: aiComposite ? (composite.model ?? null) : null,
    composite_fallback_reason: !aiComposite ? composite.fallbackReason ?? null : null,
    composite_attempts: composite.attempts ?? [],
    composite_diagnostics: !aiComposite ? composite.diagnostics ?? [] : [],
    artDirection,
    qualityReport: variant.qualityReport,
    _insert: {
      creativeId,
      variantNumber: variant.variantNumber,
      svgDataUri: variant.svgDataUri,
      styleId: variant.styleId,
      headline: variant.copy.headline,
      fullPostText: variant.copy.fullPostText,
      qualityStatus,
      qualityNotes,
      createdAt: now,
    },
  } as Record<string, unknown>;

  return { creative, selectedId: product.id, stageProvider };
}

function noStore(data: unknown, status = 200, extraHeaders: HeadersInit = {}): Response {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0, must-revalidate",
      ...extraHeaders,
    },
  });
}

async function ensureCampaign(
  env: Env,
  campaignId: string,
  campaignDate: string,
  now: number,
  totalProducts: number,
  totalImagesPlanned: number,
  tenantId: string | null = null,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO campaigns
       (id, campaign_date, status, selected_product_ids, total_products,
        total_images, started_at, completed_at, error_summary, created_at, tenant_key_id)
     VALUES (?, ?, 'running', '[]', ?, ?, ?, NULL, NULL, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  )
    .bind(campaignId, campaignDate, totalProducts, totalImagesPlanned, now, now, tenantId)
    .run();
}

async function appendSlotToCampaign(
  env: Env,
  campaignId: string,
  productId: string,
  creative: Record<string, unknown>,
  now: number,
  tenantId: string | null = null,
): Promise<void> {
  const ins = creative._insert as {
    creativeId: string;
    variantNumber: number;
    svgDataUri: string;
    styleId: string;
    headline: string;
    fullPostText: string;
    qualityStatus: string;
    qualityNotes: string;
    createdAt: number;
  };

  const existing = await env.DB.prepare(
    `SELECT selected_product_ids, total_products, total_images
     FROM campaigns WHERE id = ? ${tenantId ? "AND tenant_key_id = ?" : ""} LIMIT 1`,
  )
    .bind(...(tenantId ? [campaignId, tenantId] : [campaignId]))
    .first<{ selected_product_ids: string | null; total_products: number | null; total_images: number | null }>();

  let ids: string[] = [];
  try {
    ids = existing?.selected_product_ids ? (JSON.parse(existing.selected_product_ids) as string[]) : [];
  } catch {
    ids = [];
  }
  if (!ids.includes(productId)) ids.push(productId);
  const totalImages = (existing?.total_images ?? 0) + 1;
  const totalProducts = Math.max(existing?.total_products ?? 0, ids.length);

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO creatives
         (id, product_id, campaign_id, variant_number, image_url,
          storage_key, style_id, headline_arabic, copy_arabic,
          quality_status, quality_notes, created_at, tenant_key_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      ins.creativeId,
      productId,
      campaignId,
      ins.variantNumber,
      ins.svgDataUri,
      null,
      ins.styleId,
      ins.headline,
      ins.fullPostText,
      ins.qualityStatus,
      ins.qualityNotes,
      ins.createdAt,
      tenantId,
    ),
    env.DB.prepare(
      `UPDATE campaigns
       SET selected_product_ids = ?, total_products = ?, total_images = ?,
           status = 'running', completed_at = NULL
       WHERE id = ? ${tenantId ? "AND tenant_key_id = ?" : ""}`,
    ).bind(
      JSON.stringify(ids),
      totalProducts,
      totalImages,
      campaignId,
      ...(tenantId ? [tenantId] : []),
    ),
    env.DB.prepare(
      `UPDATE products SET last_advertised_at = ?, updated_at = ? WHERE id = ? ${
        tenantId ? "AND tenant_key_id = ?" : ""
      }`,
    ).bind(now, now, productId, ...(tenantId ? [tenantId] : [])),
  ]);
}

function stripInternal(creative: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...creative } as Record<string, unknown> & { _insert?: unknown };
  delete rest._insert;
  return rest;
}

async function handlePlan(env: Env, limit: number, tenantId: string | null = null): Promise<Response> {
  const today = cairoToday();
  const now = Date.now();
  const products = await selectEligibleProducts(env, limit, tenantId);
  const campaignId = crypto.randomUUID();
  const campaignDate = today;

  if (products.length === 0) {
    await env.DB.prepare(
      `INSERT INTO campaigns
         (id, campaign_date, status, selected_product_ids, total_products,
          total_images, started_at, completed_at, error_summary, created_at, tenant_key_id)
       VALUES (?, ?, 'empty', '[]', 0, 0, ?, ?, ?, ?, ?)`,
    )
      .bind(
        campaignId,
        campaignDate,
        now,
        now,
        "No eligible verified products with verified primary images were found.",
        now,
        tenantId,
      )
      .run();

    return noStore({
      success: true,
      mode: "plan",
      campaign: {
        id: campaignId,
        campaign_date: campaignDate,
        status: "empty",
        total_products: 0,
        total_images: 0,
        selected_product_ids: [],
      },
      slots: [],
      totalSlots: 0,
      message:
        "لا توجد منتجات موثّقة مع صورة مرجعية أساسية حالياً. تم حفظ حملة فارغة للتتبع. استخدم زر الاكتشاف والتوثيق أولاً.",
      stageProvider: "studio-fallback",
      stageProvidersByProduct: {},
      artDirectionStyles: ART_DIRECTION_STYLES,
      creatives: [],
    });
  }

  const totalSlots = products.length * 2;
  await ensureCampaign(env, campaignId, campaignDate, now, products.length, totalSlots, tenantId);

  const slots = products.flatMap((p, pi) =>
    ([1, 2] as VariantIndex[]).map((v) => ({
      slot: pi * 2 + v,
      totalSlots,
      productId: p.id,
      product_name_arabic: p.name_arabic,
      brand_arabic: p.brand_arabic,
      brand_slug: p.brand_slug,
      image_url: p.image_url,
      variantIndex: v,
    })),
  );

  return noStore({
    success: true,
    mode: "plan",
    campaign: {
      id: campaignId,
      campaign_date: campaignDate,
      status: "planned",
      total_products: products.length,
      total_images: 0,
      selected_product_ids: products.map((p) => p.id),
    },
    slots,
    totalSlots,
    requested: limit,
    artDirectionStyles: ART_DIRECTION_STYLES,
  });
}

async function handleSingle(env: Env, req: Extract<RequestMode, { mode: "single" }>, tenantId: string | null = null, tenantIndustry: string | null = null, tenantBrand: { brandName?: string | null; industry?: string | null; logoUrl?: string | null } | null = null): Promise<Response> {
  const today = cairoToday();
  const now = Date.now();
  const product = await loadEligibleProductById(env, req.productId, tenantId);
  if (!product) {
    return noStore(
      { success: false, error: "Product not eligible (must be verified with a verified primary image)." },
      404,
    );
  }

  const campaignId = req.campaignId || crypto.randomUUID();
  const campaignDate = today;
  await ensureCampaign(env, campaignId, campaignDate, now, 1, 2, tenantId);

  const [occasion, brandLogoUrl] = await Promise.all([
    loadActiveOccasion(env),
    loadBrandLogoUrl(env),
  ]);

  const { creative, stageProvider } = await generateSlotCreative(env, product, req.variantIndex, {
    today,
    now,
    occasion,
    brandLogoUrl,
    conditioningImage: req.conditioningImage ?? null,
    tenantIndustry,
    tenantBrand: { brandName: null, industry: tenantIndustry, logoUrl: brandLogoUrl ?? null },
  });
  creative.campaign_id = campaignId;

  await appendSlotToCampaign(env, campaignId, product.id, creative, now, tenantId);

  return noStore({
    success: true,
    mode: "single",
    campaign: { id: campaignId, campaign_date: campaignDate },
    slot: { productId: product.id, variantIndex: req.variantIndex },
    creative: stripInternal(creative),
    stageProvider,
    generation: { state: "completed", campaignId, creatives: 1 },
  });
}

interface GenerationContext {
  tenantId: string | null;
  tenantIndustry?: string | null;
  tenantBrand?: { brandName?: string | null; industry?: string | null; logoUrl?: string | null } | null;
}

/** Generates exactly two creatives per selected product and persists the queue. */
async function runGenerationBatch(
  env: Env,
  params: GenerationContext & {
    mode: "basic" | "batch";
    products: EligibleProductRow[];
    requested: number;
  },
): Promise<Response> {
  const { mode, products, requested, tenantId, tenantIndustry, tenantBrand } = params;
  const today = cairoToday();
  const now = Date.now();
  const campaignId = crypto.randomUUID();
  const campaignDate = today;
  const selectedIds = products.map((product) => product.id);

  if (products.length === 0) {
    await env.DB.prepare(
      `INSERT INTO campaigns
         (id, campaign_date, status, selected_product_ids, total_products,
          total_images, started_at, completed_at, error_summary, created_at, tenant_key_id)
       VALUES (?, ?, 'empty', '[]', 0, 0, ?, ?, ?, ?, ?)`,
    )
      .bind(
        campaignId,
        campaignDate,
        now,
        now,
        "No eligible verified products with verified primary images were found.",
        now,
        tenantId,
      )
      .run();

    return noStore({
      success: true,
      mode,
      campaign: {
        id: campaignId,
        campaign_date: campaignDate,
        status: "empty",
        total_products: 0,
        total_images: 0,
        selected_product_ids: [],
      },
      selected_product_ids: [],
      image_url: null,
      message:
        "لا توجد منتجات متبقية للتوليد. ارفع صور منتجات جديدة أو راجع التوثيق.",
      stageProvider: "studio-fallback",
      stageProvidersByProduct: {},
      artDirectionStyles: ART_DIRECTION_STYLES,
      creatives: [],
    });
  }

  const [occasion, brandLogoUrl, offerTexts] = await Promise.all([
    loadActiveOccasion(env),
    loadBrandLogoUrl(env),
    loadOfferTexts(env, selectedIds, tenantId),
  ]);

  const statements: D1PreparedStatement[] = [];
  const creativesOut: Record<string, unknown>[] = [];
  let runStageProvider: NanoBananaStageProvider = "studio-fallback";
  const stageProvidersByProduct: Record<string, NanoBananaStageProvider> = {};

  for (const product of products) {
    for (const variantIndex of [1, 2] as VariantIndex[]) {
      const { creative, stageProvider } = await generateSlotCreative(env, product, variantIndex, {
        today,
        now,
        occasion,
        brandLogoUrl,
        conditioningImage: null,
        tenantIndustry,
        tenantBrand,
        salesLine: product.description,
        price: product.price,
        offerText: offerTexts.get(product.id) ?? null,
      });
      creative.campaign_id = campaignId;
      if (stageProvider === "nano-banana") runStageProvider = "nano-banana";
      stageProvidersByProduct[product.id] = stageProvider;

      const ins = creative._insert as {
        creativeId: string;
        variantNumber: number;
        svgDataUri: string;
        styleId: string;
        headline: string;
        fullPostText: string;
        qualityStatus: string;
        qualityNotes: string;
        createdAt: number;
      };

      statements.push(
        env.DB.prepare(
          `INSERT INTO creatives
             (id, product_id, campaign_id, variant_number, image_url,
              storage_key, style_id, headline_arabic, copy_arabic,
              quality_status, quality_notes, created_at, tenant_key_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          ins.creativeId,
          product.id,
          campaignId,
          ins.variantNumber,
          ins.svgDataUri,
          null,
          ins.styleId,
          ins.headline,
          ins.fullPostText,
          ins.qualityStatus,
          ins.qualityNotes,
          ins.createdAt,
          tenantId,
        ),
      );

      creativesOut.push(stripInternal(creative));
    }

    statements.push(
      env.DB.prepare(
        `UPDATE products SET last_advertised_at = ?, updated_at = ? WHERE id = ? ${
          tenantId ? "AND tenant_key_id = ?" : ""
        }`,
      ).bind(now, now, product.id, ...(tenantId ? [tenantId] : [])),
    );
  }

  const status = creativesOut.every((c) => c.success) ? "completed" : "completed_with_warnings";

  statements.unshift(
    env.DB.prepare(
      `INSERT INTO campaigns
         (id, campaign_date, status, selected_product_ids, total_products,
          total_images, started_at, completed_at, error_summary, created_at, tenant_key_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      campaignId,
      campaignDate,
      status,
      JSON.stringify(selectedIds),
      selectedIds.length,
      creativesOut.length,
      now,
      now,
      selectedIds.length < requested
        ? `Only ${selectedIds.length} eligible verified product(s) were available.`
        : null,
      now,
      tenantId,
    ),
  );

  await env.DB.batch(statements);

  return noStore({
    success: true,
    mode,
    campaign: {
      id: campaignId,
      campaign_date: campaignDate,
      status,
      total_products: selectedIds.length,
      total_images: creativesOut.length,
      selected_product_ids: selectedIds,
    },
    selected_product_ids: selectedIds,
    image_url: typeof creativesOut[0]?.image_url === "string" ? creativesOut[0].image_url : null,
    requested,
    message: `تم توليد ${creativesOut.length} تصميمًا لـ ${selectedIds.length} منتج (تصميمان لكل منتج، بلا تكرار).`,
    occasion,
    stageProvider: runStageProvider,
    stageProvidersByProduct,
    artDirectionStyles: ART_DIRECTION_STYLES,
    creatives: creativesOut,
    generation: {
      state: "completed",
      campaignId,
      products: selectedIds.length,
      creatives: creativesOut.length,
    },
  });
}

async function handleBatch(env: Env, limit: number, ctx: GenerationContext): Promise<Response> {
  const products = await selectEligibleProducts(env, limit, ctx.tenantId);
  return runGenerationBatch(env, { ...ctx, mode: "batch", products, requested: limit });
}

async function handleBasic(
  env: Env,
  req: Extract<RequestMode, { mode: "basic" }>,
  ctx: GenerationContext,
): Promise<Response> {
  if (req.productIds?.length) {
    const selection = await loadExplicitProducts(env, req.productIds, ctx.tenantId);
    if (selection.alreadyGenerated.length > 0) {
      return noStore(
        {
          success: false,
          code: "already_generated",
          error: "Selected products have already been generated.",
          productIds: selection.alreadyGenerated,
        },
        409,
      );
    }
    if (selection.missing.length > 0) {
      return noStore(
        {
          success: false,
          code: "products_not_eligible",
          error: "Selected products are missing or not eligible for generation.",
          productIds: selection.missing,
        },
        404,
      );
    }
    return runGenerationBatch(env, {
      ...ctx,
      mode: "basic",
      products: selection.products,
      requested: selection.products.length,
    });
  }

  const products = await selectEligibleProducts(env, req.count, ctx.tenantId);
  return runGenerationBatch(env, { ...ctx, mode: "basic", products, requested: req.count });
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const scope = await resolveTenantScope(request, env);
  if (!scope.ok) return scope.response;

  // Generation requires a completed one-time brand lock once keys are in use.
  if (scope.tenantId) {
    const locked = await authenticateLockedTenant(request, env);
    if (!locked.ok) return locked.response;
  }

  let payload: unknown = undefined;
  try {
    const text = await request.text();
    payload = text ? JSON.parse(text) : undefined;
  } catch {
    return Response.json(
      { success: false, error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const mode = parseRequest(payload);
  if (!mode) {
    return Response.json(
      { success: false, error: "Invalid request payload." },
      { status: 400 },
    );
  }

  let leaseUntil: number | null = null;
  if (scope.tenantId) {
    const lease = await leaseGenerationSlot(env, scope.tenantId);
    if (!lease.acquired) {
      const retryAfterSeconds = Math.max(1, lease.retryAfterSeconds);
      const message =
        lease.reason === "inactive"
          ? "This access key is not active. Contact support to restore generation."
          : lease.reason === "running"
            ? `A generation is still running for this key. Try again in ${retryAfterSeconds} seconds.`
            : lease.reason === "cooldown"
              ? `Generation just finished for this key. Try again in ${retryAfterSeconds} seconds.`
              : "Another generation is already running for this key. Try again shortly.";
      return noStore(
        {
          success: false,
          code: "generation_rate_limited",
          error: message,
          retry_after_seconds: retryAfterSeconds,
          generation: {
            state: lease.reason === "inactive" ? "idle" : lease.reason,
            busy: lease.reason !== "inactive",
          },
        },
        429,
        { "Retry-After": String(retryAfterSeconds) },
      );
    }
    leaseUntil = lease.leaseUntil;
  }

  const ctx: GenerationContext = {
    tenantId: scope.tenantId,
    tenantIndustry: scope.tenant?.brand?.industry ?? null,
    tenantBrand: scope.tenant?.brand
      ? {
          brandName: scope.tenant.brand.brandName,
          industry: scope.tenant.brand.industry,
          logoUrl: scope.tenant.brand.logoUrl,
        }
      : null,
  };

  try {
    if (mode.mode === "plan") return await handlePlan(env, mode.limit, scope.tenantId);
    if (mode.mode === "single") {
      return await handleSingle(env, mode, ctx.tenantId, ctx.tenantIndustry, ctx.tenantBrand);
    }
    const response =
      mode.mode === "basic"
        ? await handleBasic(env, mode, ctx)
        : await handleBatch(env, mode.limit, ctx);
    if (scope.tenantId) {
      await recordGeneration(env, scope.tenantId, {
        action: mode.mode === "basic" ? "basic_studio" : "campaign_batch",
        campaignId: null,
        notes: mode.mode,
      });
    }
    return response;
  } catch (error) {
    console.error("Failed to run daily campaign batch.", error);
    return Response.json(
      { success: false, error: "Unable to run the daily campaign batch." },
      { status: 500 },
    );
  } finally {
    if (scope.tenantId && leaseUntil) {
      await releaseGenerationSlot(env, scope.tenantId, leaseUntil);
    }
  }
};
