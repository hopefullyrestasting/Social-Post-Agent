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
import {
  compositeProductScene,
  type ProductCompositeOutcome,
} from "../../ai/product-composite";
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
 * Manual daily batch: select up to 5 eligible products (verified + verified
 * primary image), prioritize not advertised in last 7 days, generate 2 designer-template variants (Variant 1: simple-botanical-horizon, Variant 2 alternates), persist campaign + creatives + last_advertised_at.
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

const requestSchema = z
  .object({
    limit: z.number().int().min(1).max(5).optional(),
  })
  .strict()
  .optional();

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

async function loadActiveOccasion(
  env: Env,
): Promise<OccasionGreetingInput | null> {
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

  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      { success: false, error: "Invalid request payload." },
      { status: 400 },
    );
  }

  const limit = parsed.data?.limit ?? 5;
  const today = cairoToday();
  const now = Date.now();

  try {
    // Eligible: verified product with a verified primary reference image, randomized every run.
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

    const products = eligible.results;
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

      return Response.json(
        {
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
        },
        { headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" } },
      );
    }

    const occasion = await loadActiveOccasion(env);
    const brandLogoUrl = await loadBrandLogoUrl(env);
    const statements: D1PreparedStatement[] = [];
    const creativesOut: Record<string, unknown>[] = [];
    const selectedIds: string[] = [];
    let runStageProvider: NanoBananaStageProvider = "studio-fallback";
    const stageProvidersByProduct: Record<string, NanoBananaStageProvider> = {};

    for (const product of products) {
      selectedIds.push(product.id);
      const seedBase = Array.from(product.id).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
      const [style1, style2] = variantStylePair(product.id);
      const [promotion, research] = await Promise.all([
        loadActivePromotion(env, product.id, today),
        loadResearch(env, product.id),
      ]);

      // Authorized reference-conditioned compositing (AGENTS.md rule #4): the
      // authentic packshot is sent as the image-to-image conditioning input so
      // the model paints real perspective shadows, floor reflections, rim light,
      // mist and botanicals around the genuine package while preserving the
      // label. The photographic source is preferred over the transparent cutout
      // because img2img needs real pixels where the scene will be extended;
      // the BRIA cutout remains the authentic packshot for the fallback overlay.
      // When no provider is configured we fall back to a background-only plate
      // plus the authentic SVG packshot composite.
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

      const [composite1, composite2] = await Promise.all([
        compositeProductScene(env, product.image_url, sceneContext, { styleId: style1 }),
        compositeProductScene(env, product.image_url, sceneContext, { styleId: style2 }),
      ]);

      // Background plate (only for variants the compositor could not produce):
      // FLUX (Workers AI) first, Gemini flash image second, deterministic vector
      // studio last. Nano Banana is an optional final background-only pass.
      let stageProvider: NanoBananaStageProvider = "studio-fallback";
      let stageModel: string | undefined;
      let backgroundImage: string | null = null;

      let scene1: SceneOutcome | null = null;
      let scene2: SceneOutcome | null = null;
      const needsScene1 = !composite1.image;
      const needsScene2 = !composite2.image;

      if (needsScene1 || needsScene2) {
        const [generated1, generated2] = await Promise.all([
          needsScene1
            ? generateArtDirectedScene(env, style1, sceneContext, { seed: seedBase })
            : Promise.resolve(null),
          needsScene2
            ? generateArtDirectedScene(env, style2, sceneContext, { seed: seedBase + 1 })
            : Promise.resolve(null),
        ]);
        scene1 = generated1;
        scene2 = generated2;
      }

      const stillNeedsBackground =
        (needsScene1 && !scene1?.image) || (needsScene2 && !scene2?.image);
      if (stillNeedsBackground && env.GEMINI_API_KEY?.trim()) {
        try {
          const staged = await generateBackgroundWithNanoBananaDetailed(
            env,
            ART_DIRECTION_STYLES[style1].template,
            sceneContext,
          );
          backgroundImage = staged.image;
          stageProvider = staged.provider;
          stageModel = staged.model;
        } catch (error) {
          console.error("Nano Banana background staging failed, falling back to the deterministic studio.", error);
        }
      }

      if (stageProvider === "nano-banana") {
        runStageProvider = "nano-banana";
      }
      stageProvidersByProduct[product.id] = stageProvider;

      const details: ProductDetails = {
        title: product.name_arabic,
        category: product.category ?? "",
        sourceUrl: research.sourceUrl ?? product.image_source ?? undefined,
        verificationStatus: product.verification_status,
        verifiedBenefits: research.verifiedBenefits,
        verifiedUsage: research.verifiedUsage,
        // Always the authentic packshot (cut out when BRIA succeeded).
        productImageUrl,
        warehouseStockStatus: (product.warehouse_stock_status ?? "unknown") as
          | "in_stock"
          | "out_of_stock"
          | "unknown",
      };

      const variants = ProductionEngine.executeVariants({
        product: details,
        promotion,
        occasion,
        today,
        brandLogoUrl,
        sceneImageUrls: {
          1: backgroundImage ?? scene1?.image ?? null,
          2: backgroundImage ?? scene2?.image ?? null,
        },
        stagedImageUrls: {
          1: composite1.image,
          2: composite2.image,
        },
        stagedImageContainsProductByVariant: {
          1: Boolean(composite1.image),
          2: Boolean(composite2.image),
        },
      });

      for (const variant of variants) {
        const creativeId = crypto.randomUUID();
        const qualityStatus = variant.success ? "passed" : "blocked";
        const variantStyle = variant.variantNumber === 1 ? style1 : style2;
        const styleMeta = ART_DIRECTION_STYLES[variantStyle];
        const sceneOutcome = variant.variantNumber === 1 ? scene1 : scene2;
        const compositeOutcome: ProductCompositeOutcome =
          variant.variantNumber === 1 ? composite1 : composite2;
        const aiComposite = Boolean(compositeOutcome.image);
        const aiEngine = aiComposite
          ? compositeOutcome.provider
          : stageProvider === "nano-banana"
            ? "nano-banana"
            : (sceneOutcome?.provider ?? "deterministic-studio");
        const aiEngineModel = aiComposite
          ? compositeOutcome.model
          : stageProvider === "nano-banana"
            ? stageModel
            : sceneOutcome?.model;
        const backgroundProvider = aiComposite
          ? "reference-conditioned-composite"
          : stageProvider === "nano-banana"
            ? "nano-banana"
            : (sceneOutcome?.provider ?? "deterministic-studio");
        const artDirection = {
          styleId: variantStyle,
          styleLabelAr: styleMeta.labelAr,
          styleLabelEn: styleMeta.labelEn,
          accent: styleMeta.accent,
          engine: aiEngine,
          ...(aiEngineModel ? { model: aiEngineModel } : {}),
          cutoutApplied,
          // Reference-conditioned composite already contains the authentic
          // product; background-only variants keep the authentic SVG packshot.
          stagedProduct: aiComposite,
          backgroundOnly: !aiComposite,
          aiComposite,
          containsProduct: aiComposite,
          usedReference: aiComposite && compositeOutcome.usedReference,
          compositeProvider: aiComposite ? compositeOutcome.provider : null,
          compositeModel: aiComposite ? (compositeOutcome.model ?? null) : null,
          backgroundProvider,
          compositeFallbackReason: !aiComposite ? compositeOutcome.fallbackReason ?? null : null,
          compositeAttempts: compositeOutcome.attempts ?? [],
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

        statements.push(
          env.DB.prepare(
            `INSERT INTO creatives
               (id, product_id, campaign_id, variant_number, image_url,
                storage_key, style_id, headline_arabic, copy_arabic,
                quality_status, quality_notes, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).bind(
            creativeId,
            product.id,
            campaignId,
            variant.variantNumber,
            variant.svgDataUri,
            null,
            variant.styleId,
            variant.copy.headline,
            variant.copy.fullPostText,
            qualityStatus,
            qualityNotes,
            now,
          ),
        );

        creativesOut.push({
          id: creativeId,
          campaign_id: campaignId,
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
          sceneProvider: sceneOutcome?.provider ?? "deterministic-studio",
          sceneModel: sceneOutcome?.model,
          art_direction_style: variantStyle,
          art_direction_label: styleMeta.labelAr,
          art_direction_label_en: styleMeta.labelEn,
          ai_engine: aiEngine,
          ai_engine_model: aiEngineModel,
          cutout_applied: cutoutApplied,
          ai_composite: aiComposite,
          contains_product: aiComposite,
          used_reference: aiComposite && compositeOutcome.usedReference,
          composite_provider: aiComposite ? compositeOutcome.provider : null,
          composite_model: aiComposite ? (compositeOutcome.model ?? null) : null,
          composite_fallback_reason: !aiComposite ? compositeOutcome.fallbackReason ?? null : null,
          composite_attempts: compositeOutcome.attempts ?? [],
          composite_diagnostics: !aiComposite ? compositeOutcome.diagnostics ?? [] : [],
          artDirection,
          qualityReport: variant.qualityReport,
        });
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

    return Response.json(
      {
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
      },
      { headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" } },
    );
  } catch (error) {
    console.error("Failed to run daily campaign batch.", error);
    return Response.json(
      { success: false, error: "Unable to run the daily campaign batch." },
      { status: 500 },
    );
  }
};



