import { ArabicCopywriter, ProductDetails, GeneratedArabicCopy, PostAngle } from "./arabic-copywriter";
import { OverlaySystem, OverlayOptions } from "./overlay-system";
import { QualityGate, QualityGateReport } from "./quality-gate";

export interface ProductionRequest {
  product: ProductDetails;
  angle?: PostAngle;
  width?: number;
  height?: number;
  baseColor?: string;
  customPillText?: string;
}

export interface ProductionResult {
  success: boolean;
  copy: GeneratedArabicCopy;
  qualityReport: QualityGateReport;
  svgOverlay: string;
  svgDataUri: string;
  metadata: {
    productName: string;
    salePrice: number;
    angle: string;
    generatedAt: string;
    dimensions: { width: number; height: number };
  };
}

export class ProductionEngine {
  /**
   * تشغيل خط الإنتاج الكامل لبوست "مخزن الرحمة" (Pure Client-Side SVG Pipeline)
   */
  public static execute(request: ProductionRequest): ProductionResult {
    const {
      product,
      angle = "flash_sale",
      width = 1080,
      height = 1080,
      customPillText,
    } = request;

    // 1. توليد النصوص التسويقية العربية
    const copy = ArabicCopywriter.generatePost(product, angle);

    // 2. إعداد مواصفات الـ Overlay
    let discountText = "عرض خاص";
    if (product.originalPrice && product.originalPrice > product.salePrice) {
      const percentage = Math.round(((product.originalPrice - product.salePrice) / product.originalPrice) * 100);
      discountText = `خصم ${percentage}%`;
    }

    const overlayOpts: OverlayOptions = {
      width,
      height,
      showLogo: true,
      showDiscountBadge: true,
      discountText,
      showPriceTag: true,
      salePrice: product.salePrice,
      originalPrice: product.originalPrice,
      currency: product.currency || "ج.م",
      showFooterBar: true,
      customPillText: customPillText || "خامة أصلية 100%",
    };

    // 3. توليد كود الـ SVG للطبقات البصرية
    const svgOverlay = OverlaySystem.generateOverlaySvg(overlayOpts);

    // 4. فحص الجودة (Quality Gate)
    const qualityReport = QualityGate.evaluate(copy, product, overlayOpts);

    // 5. إنشاء Data URI للـ SVG لتمكين عرضه وتحميله مباشرة من المتصفح بدون أي سيرفر
    const svgDataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgOverlay)}`;

    return {
      success: qualityReport.passed,
      copy,
      qualityReport,
      svgOverlay,
      svgDataUri,
      metadata: {
        productName: product.title,
        salePrice: product.salePrice,
        angle,
        generatedAt: new Date().toISOString(),
        dimensions: { width, height },
      },
    };
  }
}
