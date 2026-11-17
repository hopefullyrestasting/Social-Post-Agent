import { z } from "zod";
import { cairoToday, daysBetween, nextOccurrenceInWindow } from "../../_dates";
import {
  ProductionEngine,
  buildOccasionGreeting,
  type OccasionGreetingInput,
  type ProductDetails,
  type PromotionRecord,
} from "../../../../src/lib/al-rahma";
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

/**
 * POST /api/db/campaigns/run (protected by admin middleware)
 *
 * Modes:
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
  | { mode: "batch"; limit: number }
  | { mode: "plan"; limit: number }
  | { mode: "single"; campaignId?: string; productId: string; variantIndex: 1 | 2; conditioningImage?: string };

function parseRequest(payload: unknown): RequestMode | null {
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
    if ("planOnly" in obj || "productId" in obj || "variantIndex" in obj || "campaignId" in obj) {
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

async function selectEligibleProducts(env: Env, limit: number): Promise<EligibleProductRow[]> {
  const eligible = await env.DB.prepare(
    `SELECT p.id, p.name_arabic, p.name_english, p.category,
            p.verification_status, p.warehouse_stock_status, p.last_advertised_at,
            pa.image_url, pa.source_url AS image_source,
            b.name_arabic AS brand_arabic, b.slug AS brand_slug
     FROM products p
     JOIN brands b ON b.id = p.brand_id
     JOIN product_assets pa
       ON pa.product_id = p.id
      AND pa.image_type = 'reference'
      AND pa.is_primary = 1
      AND pa.verification_status = 'verified'
      AND pa.image_url IS NOT NULL
      AND TRIM(pa.image_url) != ''
     WHERE p.verification_status = 'verified'
     ORDER BY RANDOM()
     LIMIT ?`,
  )
    .bind(limit)
    .all<EligibleProductRow>();
  return eligible.results;
}

async function loadEligibleProductById(env: Env, productId: string): Promise<EligibleProductRow | null> {
  const row = await env.DB.prepare(
    `SELECT p.id, p.name_arabic, p.name_english, p.category,
            p.verification_status, p.warehouse_stock_status, p.last_advertised_at,
            pa.image_url, pa.source_url AS image_source,
            b.name_arabic AS brand_arabic, b.slug AS brand_slug
     FROM products p
     JOIN brands b ON b.id = p.brand_id
     JOIN product_assets pa
       ON pa.product_id = p.id
      AND pa.image_type = 'reference'
      AND pa.is_primary = 1
      AND pa.verification_status = 'verified'
      AND pa.image_url IS NOT NULL
      AND TRIM(pa.image_url) != ''
     WHERE p.verification_status = 'verified' AND p.id = ?
     LIMIT 1`,
  )
    .bind(productId)
    .first<EligibleProductRow>();
  return row ?? null;
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
  },
): Promise<{ creative: Record<string, unknown>; selectedId: string; stageProvider: NanoBananaStageProvider }> {
  const { today, now, occasion, brandLogoUrl, conditioningImage } = opts;
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

  const sceneContext = {
    brand: product.brand_arabic,
    category: product.category,
    name: product.name_arabic,
    benefits: research.verifiedBenefits,
  };

  const styles: [ArtDirectionStyleId, ArtDirectionStyleId] = [style1, style2];
  const targetStyle = styles[variantIndex - 1];

  // Conditioning image (client-built 768x1344 canvas with BRIA cutout placed
  // at hero position) is the preferred reference for img2img so the model paints
  // the environment around the real bottle; fall back to the authentic photo.
  const compositeReference = conditioningImage?.trim() || product.image_url;

  const composite = await compositeProductScene(env, compositeReference, sceneContext, { styleId: targetStyle });

  let stageProvider: NanoBananaStageProvider = "studio-fallback";
  let stageModel: string | undefined;
  let backgroundImage: string | null = null;
  let scene: SceneOutcome | null = null;

  if (!composite.image) {
    scene = await generateArtDirectedScene(env, targetStyle, sceneContext, {
      seed: seedBase + (variantIndex - 1),
    });
    if (!scene?.image && env.GEMINI_API_KEY?.trim()) {
      try {
        const staged = await generateBackgroundWithNanoBananaDetailed(
          env,
          ART_DIRECTION_STYLES[targetStyle].template,
          sceneContext,
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

function noStore(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" },
  });
}

async function ensureCampaign(
  env: Env,
  campaignId: string,
  campaignDate: string,
  now: number,
  totalProducts: number,
  totalImagesPlanned: number,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO campaigns
       (id, campaign_date, status, selected_product_ids, total_products,
        total_images, started_at, completed_at, error_summary, created_at)
     VALUES (?, ?, 'running', '[]', ?, ?, ?, NULL, NULL, ?)
     ON CONFLICT(id) DO NOTHING`,
  )
    .bind(campaignId, campaignDate, totalProducts, totalImagesPlanned, now, now)
    .run();
}

async function appendSlotToCampaign(
  env: Env,
  campaignId: string,
  productId: string,
  creative: Record<string, unknown>,
  now: number,
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
    "SELECT selected_product_ids, total_products, total_images FROM campaigns WHERE id = ? LIMIT 1",
  )
    .bind(campaignId)
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
          quality_status, quality_notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    ),
    env.DB.prepare(
      `UPDATE campaigns
       SET selected_product_ids = ?, total_products = ?, total_images = ?,
           status = 'running', completed_at = NULL
       WHERE id = ?`,
    ).bind(JSON.stringify(ids), totalProducts, totalImages, campaignId),
    env.DB.prepare(
      "UPDATE products SET last_advertised_at = ?, updated_at = ? WHERE id = ?",
    ).bind(now, now, productId),
  ]);
}

function stripInternal(creative: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...creative } as Record<string, unknown> & { _insert?: unknown };
  delete rest._insert;
  return rest;
}

async function handlePlan(env: Env, limit: number): Promise<Response> {
  const today = cairoToday();
  const now = Date.now();
  const products = await selectEligibleProducts(env, limit);
  const campaignId = crypto.randomUUID();
  const campaignDate = today;

  if (products.length === 0) {
    await env.DB.prepare(
      `INSERT INTO campaigns
         (id, campaign_date, status, selected_product_ids, total_products,
          total_images, started_at, completed_at, error_summary, created_at)
       VALUES (?, ?, 'empty', '[]', 0, 0, ?, ?, ?, ?)`,
    )
      .bind(
        campaignId,
        campaignDate,
        now,
        now,
        "No eligible verified products with verified primary images were found.",
        now,
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
  await ensureCampaign(env, campaignId, campaignDate, now, products.length, totalSlots);

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

async function handleSingle(env: Env, req: Extract<RequestMode, { mode: "single" }>): Promise<Response> {
  const today = cairoToday();
  const now = Date.now();
  const product = await loadEligibleProductById(env, req.productId);
  if (!product) {
    return noStore(
      { success: false, error: "Product not eligible (must be verified with a verified primary image)." },
      404,
    );
  }

  const campaignId = req.campaignId || crypto.randomUUID();
  const campaignDate = today;
  await ensureCampaign(env, campaignId, campaignDate, now, 1, 2);

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
  });
  creative.campaign_id = campaignId;

  await appendSlotToCampaign(env, campaignId, product.id, creative, now);

  return noStore({
    success: true,
    mode: "single",
    campaign: { id: campaignId, campaign_date: campaignDate },
    slot: { productId: product.id, variantIndex: req.variantIndex },
    creative: stripInternal(creative),
    stageProvider,
  });
}

async function handleBatch(env: Env, limit: number): Promise<Response> {
  const today = cairoToday();
  const now = Date.now();

  const products = await selectEligibleProducts(env, limit);
  const campaignId = crypto.randomUUID();
  const campaignDate = today;

  if (products.length === 0) {
    await env.DB.prepare(
      `INSERT INTO campaigns
         (id, campaign_date, status, selected_product_ids, total_products,
          total_images, started_at, completed_at, error_summary, created_at)
       VALUES (?, ?, 'empty', '[]', 0, 0, ?, ?, ?, ?)`,
    )
      .bind(
        campaignId,
        campaignDate,
        now,
        now,
        "No eligible verified products with verified primary images were found.",
        now,
      )
      .run();

    return noStore({
      success: true,
      campaign: {
        id: campaignId,
        campaign_date: campaignDate,
        status: "empty",
        total_products: 0,
        total_images: 0,
      },
      message:
        "لا توجد منتجات موثّقة مع صورة مرجعية أساسية حالياً. تم حفظ حملة فارغة للتتبع. استخدم زر الاكتشاف والتوثيق أولاً.",
      stageProvider: "studio-fallback",
      stageProvidersByProduct: {},
      artDirectionStyles: ART_DIRECTION_STYLES,
      creatives: [],
    });
  }

  const [occasion, brandLogoUrl] = await Promise.all([
    loadActiveOccasion(env),
    loadBrandLogoUrl(env),
  ]);

  const statements: D1PreparedStatement[] = [];
  const creativesOut: Record<string, unknown>[] = [];
  const selectedIds: string[] = [];
  let runStageProvider: NanoBananaStageProvider = "studio-fallback";
  const stageProvidersByProduct: Record<string, NanoBananaStageProvider> = {};

  for (const product of products) {
    selectedIds.push(product.id);
    for (const variantIndex of [1, 2] as VariantIndex[]) {
      const { creative, stageProvider } = await generateSlotCreative(env, product, variantIndex, {
        today,
        now,
        occasion,
        brandLogoUrl,
        conditioningImage: null,
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
              quality_status, quality_notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        ),
      );

      creativesOut.push(stripInternal(creative));
    }

    statements.push(
      env.DB.prepare(
        "UPDATE products SET last_advertised_at = ?, updated_at = ? WHERE id = ?",
      ).bind(now, now, product.id),
    );
  }

  const status = creativesOut.every((c) => c.success) ? "completed" : "completed_with_warnings";

  statements.unshift(
    env.DB.prepare(
      `INSERT INTO campaigns
         (id, campaign_date, status, selected_product_ids, total_products,
          total_images, started_at, completed_at, error_summary, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      campaignId,
      campaignDate,
      status,
      JSON.stringify(selectedIds),
      selectedIds.length,
      creativesOut.length,
      now,
      now,
      selectedIds.length < limit
        ? `Only ${selectedIds.length} eligible verified product(s) were available.`
        : null,
      now,
    ),
  );

  await env.DB.batch(statements);

  return noStore({
    success: true,
    campaign: {
      id: campaignId,
      campaign_date: campaignDate,
      status,
      total_products: selectedIds.length,
      total_images: creativesOut.length,
      selected_product_ids: selectedIds,
    },
    requested: limit,
    message:
      selectedIds.length < limit
        ? `تم توليد ${creativesOut.length} إعلاناً لـ ${selectedIds.length} منتج موثّق (أقل من 5 منتجات متاحة حالياً — استخدم زر الاكتشاف لزيادة التنوع).`
        : `تم توليد ${creativesOut.length} إعلاناً لـ ${selectedIds.length} منتجات موثّقة بأنماط إخراج فنية متنوعة.`,
    occasion,
    stageProvider: runStageProvider,
    stageProvidersByProduct,
    artDirectionStyles: ART_DIRECTION_STYLES,
    creatives: creativesOut,
  });
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
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

  try {
    if (mode.mode === "plan") return await handlePlan(env, mode.limit);
    if (mode.mode === "single") return await handleSingle(env, mode);
    return await handleBatch(env, mode.limit);
  } catch (error) {
    console.error("Failed to run daily campaign batch.", error);
    return Response.json(
      { success: false, error: "Unable to run the daily campaign batch." },
      { status: 500 },
    );
  }
};
