import {
  ArabicCopywriter,
  GeneratedArabicCopy,
  PostAngle,
  ProductDetails,
} from "./arabic-copywriter";
import { AL_RAHMA_BRAND_CONFIG, buildBrandConfigFromTenant, type BrandConfig, type TenantBrandContext } from "./brand-core";
import {
  BackgroundLayer,
  DesignerTemplate,
  resolveBackground,
  resolveSimplePaletteKey,
  templateForVariant,
} from "./background-provider";
import {
  evaluatePromotion,
  normalizeOccasionInput,
  OccasionGreetingInput,
  PromotionRecord,
  ValidPromotion,
} from "./commercial";
import { cairoToday, isIsoDate } from "./dates";
import { OverlayOptions, OverlaySystem } from "./overlay-system";
import { QualityGate, QualityGateReport } from "./quality-gate";

export interface ProductionRequest {
  product: ProductDetails;
  variant?: 1 | 2;
  template?: DesignerTemplate;
  /** Pre-generated AI studio scene image (data URI or URL). */
  sceneImageUrl?: string | null;
  /**
   * Full staged image (background + authentic product composed, e.g. Nano Banana).
   * When provided, used as the scene and the packshot is not duplicated.
   */
  stagedImageUrl?: string | null;
  /** True when the staged image is a reference-conditioned composite that already contains the product. */
  stagedImageContainsProduct?: boolean;
  /** Uploaded brand logo (URL or data URI) rendered in the top brand badge. */
  brandLogoUrl?: string | null;
  width?: number;
  height?: number;
  /** Raw promotion row; validated and windowed inside the engine. */
  promotion?: PromotionRecord | null;
  /** In-window cultural occasion resolved by the calendar API. */
  occasion?: OccasionGreetingInput | null;
  /** Override "today" for deterministic previews and tests. */
  today?: string;
  /** Tenant brand context for dynamic multi-tenant rendering/copy/gate. */
  brand?: TenantBrandContext | BrandConfig | null;
}

export type ProductionVariantsRequest = Omit<ProductionRequest, "variant" | "template" | "sceneImageUrl" | "stagedImageUrl"> & {
  /** Per-variant AI studio scene images (data URI or URL). */
  sceneImageUrls?: Partial<Record<1 | 2, string | null>>;
  /** Per-variant full staged images (background + product composed). */
  stagedImageUrls?: Partial<Record<1 | 2, string | null>>;
  /** Per-variant marker: the staged image already contains the authentic product. */
  stagedImageContainsProductByVariant?: Partial<Record<1 | 2, boolean>>;
};

export interface ProductionResult {
  success: boolean;
  variant: DesignerTemplate;
  template: DesignerTemplate;
  variantNumber: 1 | 2;
  styleId: string;
  angle: PostAngle;
  copy: GeneratedArabicCopy;
  qualityReport: QualityGateReport;
  svgOverlay: string;
  svgDataUri: string;
  background: {
    provider: BackgroundLayer["provider"];
    requestedProvider: BackgroundLayer["requestedProvider"];
    kind: BackgroundLayer["kind"];
    fallbackReason?: string;
  };
  blockers: string[];
  metadata: {
    productName: string;
    angle: string;
    variant: string;
    template: string;
    variantNumber: number;
    generatedAt: string;
    dimensions: { width: number; height: number };
    productImageUrl: string | null;
    sourceUrl: string | null;
    verifiedClaims: string[];
    warehouseStockStatus: string;
    promotion: {
      id: string;
      discountPercent: number;
      originalPrice: number;
      promoPrice: number;
      startsAt: string;
      endsAt: string;
    } | null;
    occasion: {
      id: string;
      occasionName: string;
      greeting: string;
      occasionDate: string;
    } | null;
  };
}

const AVAILABILITY_LABELS: Record<string, string> = {
  in_stock: "متوفر في المخزن",
  out_of_stock: "غير متوفر حالياً",
};

function availabilityText(status: string | undefined): string {
  if (!status || status === "unknown") return "";
  return AVAILABILITY_LABELS[status] ?? "";
}

function resolveAngle(variantNumber: 1 | 2, product: ProductDetails): PostAngle {
  if (variantNumber === 1) return "product_information";
  const hasUsage = (product.verifiedUsage ?? []).some(
    (item) => item.trim().length > 0,
  );
  return hasUsage ? "beauty_routine" : "product_features";
}

export class ProductionEngine {
  public static execute(request: ProductionRequest): ProductionResult {
    const variantNumber = request.variant ?? 1;
    const seed = request.product.title || request.product.productImageUrl || "al-rahma";
    const template =
      request.template ?? templateForVariant(variantNumber, seed);
    return ProductionEngine.build(request, variantNumber, template);
  }

  /** Two required creative variants per product, rotating across the three luxury styles. */
  public static executeVariants(
    request: ProductionVariantsRequest,
  ): ProductionResult[] {
    const seed = request.product.title || request.product.productImageUrl || "al-rahma";
    const templates: Array<{ variantNumber: 1 | 2; template: DesignerTemplate }> = [
      { variantNumber: 1, template: templateForVariant(1, seed) },
      { variantNumber: 2, template: templateForVariant(2, seed) },
    ];
    return templates.map(({ variantNumber, template }) =>
      ProductionEngine.build(
        {
          ...request,
          sceneImageUrl: request.sceneImageUrls?.[variantNumber] ?? null,
          stagedImageUrl: request.stagedImageUrls?.[variantNumber] ?? null,
          stagedImageContainsProduct:
            request.stagedImageContainsProductByVariant?.[variantNumber] ?? false,
        },
        variantNumber,
        template,
      ),
    );
  }

  private static build(
    request: ProductionRequest,
    variantNumber: 1 | 2,
    template: DesignerTemplate,
  ): ProductionResult {
    const { product } = request;
    const brand = (request.brand && "visual" in request.brand ? (request.brand as BrandConfig) : buildBrandConfigFromTenant(request.brand as TenantBrandContext | null | undefined));
    const width = request.width ?? brand.visual.format.width;
    const height = request.height ?? brand.visual.format.height;
    const angle = resolveAngle(variantNumber, product);

    const today =
      request.today && isIsoDate(request.today)
        ? request.today
        : cairoToday(new Date(), brand.commercial.timezone);
    const promotionEvaluation = evaluatePromotion(request.promotion, today);
    const activePromotion: ValidPromotion | null =
      promotionEvaluation.status === "active"
        ? promotionEvaluation.promotion
        : null;
    const occasion = normalizeOccasionInput(request.occasion);

    const copy = ArabicCopywriter.generatePost(product, angle, {
      variant: variantNumber,
      ctaIndex: variantNumber - 1,
      occasionGreeting: occasion?.greeting,
      brand,
    });

    const productImageUrl = product.productImageUrl?.trim() || null;
    const stagedImageUrl = request.stagedImageUrl?.trim() || null;
    const effectiveSceneImageUrl = stagedImageUrl ?? request.sceneImageUrl ?? null;
    // Colour-match the Simple studio wall/floor to the packaging mood.
    const palette = resolveSimplePaletteKey({
      category: product.category,
      name: [product.title, product.badgeText].filter(Boolean).join(" "),
      benefits: [
        ...(product.features ?? []),
        ...(product.verifiedBenefits ?? []),
      ],
    });
    const background = resolveBackground({
      width,
      height,
      template,
      palette,
      sceneImageUrl: effectiveSceneImageUrl,
    });

    const overlayOptions: OverlayOptions = {
      width,
      height,
      template,
      palette,
      sceneImageUrl: effectiveSceneImageUrl,
      stagedImageUrl,
      stagedImageContainsProduct: request.stagedImageContainsProduct ?? Boolean(stagedImageUrl),
      brandLogoUrl: request.brandLogoUrl ?? (brand as unknown as { logoUrl?: string }).logoUrl ?? null,
      brand,
      productImageUrl,
      headline: copy.headline,
      benefitLine: copy.benefitLine,
      ctaText: copy.ctaShort,
      availabilityText: availabilityText(product.warehouseStockStatus),
      background,
      promotion: activePromotion,
      occasion,
    };

    const qualityReport = QualityGate.evaluate(
      copy,
      product,
      overlayOptions,
      { promotion: promotionEvaluation, occasion },
    );

    const blockers: string[] = [];
    if (!productImageUrl && !stagedImageUrl) {
      blockers.push("صورة المنتج الأصلية (packshot) مطلوبة لتركيب الإعلان.");
    }
    if (promotionEvaluation.status === "invalid") {
      blockers.push(promotionEvaluation.reason);
    }

    const svgOverlay = OverlaySystem.generateOverlaySvg(overlayOptions);
    const svgDataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
      svgOverlay,
    )}`;
    const verifiedClaims = [
      ...(product.verifiedBenefits ?? []),
      ...(product.verifiedUsage ?? []),
    ]
      .map((claim) => claim.trim())
      .filter((claim) => claim.length > 0);

    const styleId = `${brand.id === AL_RAHMA_BRAND_CONFIG.id ? 'al-rahma' : (brand.id || 'tenant')}/${template}`;

    return {
      success: qualityReport.passed && blockers.length === 0,
      variant: template,
      template,
      variantNumber,
      styleId,
      angle,
      copy,
      qualityReport,
      svgOverlay,
      svgDataUri,
      background: {
        provider: background.provider,
        requestedProvider: background.requestedProvider,
        kind: background.kind,
        fallbackReason: background.fallbackReason,
      },
      blockers,
      metadata: {
        productName: product.title,
        angle,
        variant: template,
        template,
        variantNumber,
        generatedAt: new Date().toISOString(),
        dimensions: { width, height },
        productImageUrl,
        sourceUrl: product.sourceUrl?.trim() || null,
        verifiedClaims,
        warehouseStockStatus: product.warehouseStockStatus ?? "unknown",
        promotion: activePromotion
          ? {
              id: activePromotion.id,
              discountPercent: activePromotion.discountPercent,
              originalPrice: activePromotion.originalPrice,
              promoPrice: activePromotion.promoPrice,
              startsAt: activePromotion.startsAt,
              endsAt: activePromotion.endsAt,
            }
          : null,
        occasion: occasion
          ? {
              id: occasion.id,
              occasionName: occasion.occasionName,
              greeting: occasion.greeting,
              occasionDate: occasion.occasionDate,
            }
          : null,
      },
    };
  }
}


