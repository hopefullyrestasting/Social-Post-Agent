import {
  ArabicCopywriter,
  GeneratedArabicCopy,
  PostAngle,
  ProductDetails,
} from "./arabic-copywriter";
import { AL_RAHMA_BRAND_CONFIG } from "./brand-core";
import {
  AdVariant,
  BackgroundLayer,
  BackgroundProviderId,
  resolveBackground,
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
  variant?: AdVariant;
  backgroundProvider?: BackgroundProviderId;
  width?: number;
  height?: number;
  /** Raw promotion row; validated and windowed inside the engine. */
  promotion?: PromotionRecord | null;
  /** In-window cultural occasion resolved by the calendar API. */
  occasion?: OccasionGreetingInput | null;
  /** Override "today" for deterministic previews and tests. */
  today?: string;
}

export type ProductionVariantsRequest = Omit<ProductionRequest, "variant">;

export interface ProductionResult {
  success: boolean;
  variant: AdVariant;
  variantNumber: 1 | 2;
  styleId: string;
  angle: PostAngle;
  copy: GeneratedArabicCopy;
  qualityReport: QualityGateReport;
  svgOverlay: string;
  svgDataUri: string;
  background: {
    provider: BackgroundProviderId;
    requestedProvider: BackgroundProviderId;
    kind: BackgroundLayer["kind"];
    fallbackReason?: string;
  };
  blockers: string[];
  metadata: {
    productName: string;
    angle: string;
    variant: string;
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

const STYLE_ID = "al-rahma/clean-white-silver-mesh";
const PRODUCT_VARIANTS: readonly AdVariant[] = ["hero-clean", "studio-angle"];

const AVAILABILITY_LABELS: Record<string, string> = {
  in_stock: "متوفر في المخزن",
  out_of_stock: "غير متوفر حالياً",
};

function availabilityText(status: string | undefined): string {
  if (!status || status === "unknown") return "";
  return AVAILABILITY_LABELS[status] ?? "";
}

function resolveAngle(
  variant: AdVariant,
  product: ProductDetails,
): PostAngle {
  if (variant === "hero-clean") return "product_information";
  const hasUsage = (product.verifiedUsage ?? []).some(
    (item) => item.trim().length > 0,
  );
  return hasUsage ? "beauty_routine" : "product_features";
}

export class ProductionEngine {
  /**
   * Clean white + subtle silver-mesh composer.
   * No pricing, no discounts, no generative packaging.
   */
  public static execute(request: ProductionRequest): ProductionResult {
    return ProductionEngine.build(request, request.variant ?? "hero-clean");
  }

  /** The two required creative variants for a product, in order 1 → 2. */
  public static executeVariants(
    request: ProductionVariantsRequest,
  ): ProductionResult[] {
    return PRODUCT_VARIANTS.map((variant) =>
      ProductionEngine.build(request, variant),
    );
  }

  private static build(
    request: ProductionRequest,
    variant: AdVariant,
  ): ProductionResult {
    const { product } = request;
    const width = request.width ?? AL_RAHMA_BRAND_CONFIG.visual.format.width;
    const height = request.height ?? AL_RAHMA_BRAND_CONFIG.visual.format.height;
    const variantNumber: 1 | 2 = variant === "hero-clean" ? 1 : 2;
    const angle = resolveAngle(variant, product);

    const today =
      request.today && isIsoDate(request.today)
        ? request.today
        : cairoToday(new Date(), AL_RAHMA_BRAND_CONFIG.commercial.timezone);
    const promotionEvaluation = evaluatePromotion(request.promotion, today);
    const activePromotion: ValidPromotion | null =
      promotionEvaluation.status === "active"
        ? promotionEvaluation.promotion
        : null;
    const occasion = normalizeOccasionInput(request.occasion);

    const copy = ArabicCopywriter.generatePost(product, angle, {
      variant,
      ctaIndex: variantNumber - 1,
      occasionGreeting: occasion?.greeting,
    });

    const productImageUrl = product.productImageUrl?.trim() || null;
    const background = resolveBackground(request.backgroundProvider, {
      width,
      height,
      variant,
    });

    const overlayOptions: OverlayOptions = {
      width,
      height,
      variant,
      productImageUrl,
      headline: copy.headline,
      benefitLine: copy.benefitLine,
      ctaText: copy.ctaShort,
      availabilityText: availabilityText(product.warehouseStockStatus),
      background,
      backgroundProvider: request.backgroundProvider,
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
    if (!productImageUrl) {
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

    return {
      success: qualityReport.passed && blockers.length === 0,
      variant,
      variantNumber,
      styleId: STYLE_ID,
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
        variant,
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
