"use client";

import { useMemo } from "react";
import {
  ProductionEngine,
  type OccasionGreetingInput,
  type ProductDetails,
  type PromotionRecord,
  type WarehouseStockStatus,
} from "@/lib/al-rahma";

export type AdPreviewResearch = {
  product: { verification_status: string };
  referenceImages: { image_url: string | null; is_primary: number }[];
  informationSources: { source_url: string; verification_status: string }[];
  verifiedBenefits: { claim_text: string }[];
  verifiedUsage: { claim_text: string }[];
  latestStockStatus: string | null;
};

export type AdPreviewProduct = {
  id: string;
  name_arabic: string;
  category: string | null;
  warehouse_stock_status: string | null;
};

type Props = {
  product: AdPreviewProduct;
  research: AdPreviewResearch;
  promotion?: PromotionRecord | null;
  occasion?: OccasionGreetingInput | null;
};

const TEMPLATE_TITLES: Record<string, string> = {
  "silver-podium-botanical": "النسخة 1 — منصة فضية ونباتات",
  "botanical-arch-frame": "النسخة 2 — إطار قوسي نباتي",
  "editorial-beauty-card": "النسخة 2 — بطاقة تحريرية تجميلية",
};

const ANGLE_LABELS: Record<string, string> = {
  product_information: "معلومات المنتج",
  product_features: "مميزات المنتج",
  beauty_routine: "روتين العناية",
  combo_deal: "تشكيلة منتجات",
};

function stockStatus(value: string | null): WarehouseStockStatus {
  if (value === "in_stock" || value === "out_of_stock") return value;
  return "unknown";
}

export default function AdPreview({
  product,
  research,
  promotion,
  occasion,
}: Props) {
  const results = useMemo(() => {
    const primary =
      research.referenceImages.find((image) => image.is_primary === 1) ??
      research.referenceImages[0];
    const verifiedSource = research.informationSources.find(
      (source) => source.verification_status === "verified",
    );

    const details: ProductDetails = {
      title: product.name_arabic,
      category: product.category ?? "",
      sourceUrl: verifiedSource?.source_url,
      verificationStatus: research.product.verification_status,
      verifiedBenefits: research.verifiedBenefits.map((claim) => claim.claim_text),
      verifiedUsage: research.verifiedUsage.map((claim) => claim.claim_text),
      productImageUrl: primary?.image_url ?? null,
      warehouseStockStatus: stockStatus(research.latestStockStatus),
    };

    return ProductionEngine.executeVariants({
      product: details,
      promotion,
      occasion,
    });
  }, [product, research, promotion, occasion]);

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-bold">
          معاينة إعلانين (2 Variants) — {product.name_arabic}
        </h4>
        <span className="text-xs text-slate-500">
          {results[0]?.metadata.dimensions.width}×
          {results[0]?.metadata.dimensions.height} — {results[0]?.template} —{" "}
          {results[0]?.background.provider === "deterministic-studio"
            ? "مشهد استوديو"
            : results[0]?.background.provider}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {results.map((result) => {
          const failedChecks = result.qualityReport.checks.filter(
            (check) => !check.passed,
          );

          return (
            <article
              key={`${result.variantNumber}-${result.template}`}
              className="rounded-2xl border border-slate-200 bg-white p-3"
            >
              <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-extrabold">
                    {TEMPLATE_TITLES[result.template] ?? result.template}
                  </p>
                  <p className="text-xs text-slate-500">
                    {ANGLE_LABELS[result.angle] ?? result.angle} —{" "}
                    {result.copy.ctaShort}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    result.success
                      ? "bg-emerald-50 text-emerald-800"
                      : "bg-amber-50 text-amber-800"
                  }`}
                >
                  {result.success
                    ? `جاهز للنشر — ${result.qualityReport.overallScore}%`
                    : "يحتاج استكمال البيانات"}
                </span>
              </header>

              <div
                className="overflow-hidden rounded-xl border border-slate-200 bg-white [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
                dangerouslySetInnerHTML={{ __html: result.svgOverlay }}
              />

              <div className="mt-3 space-y-1 text-xs text-slate-600">
                <p>
                  <b>العنوان:</b> {result.copy.headline}
                </p>
                {result.copy.benefitLine && (
                  <p>
                    <b>جملة البيع:</b> {result.copy.benefitLine}
                  </p>
                )}
                {result.blockers.length > 0 && (
                  <p className="font-bold text-amber-700">
                    متطلبات ناقصة: {result.blockers.join(" ")}
                  </p>
                )}
                {failedChecks.length > 0 && (
                  <ul className="list-inside list-disc text-amber-700">
                    {failedChecks.map((check) => (
                      <li key={check.checkName}>{check.message}</li>
                    ))}
                  </ul>
                )}
                <a
                  className="inline-block font-bold text-emerald-700 underline"
                  href={result.svgDataUri}
                  download={`${product.id}-${result.template}.svg`}
                >
                  تحميل SVG
                </a>
              </div>
            </article>
          );
        })}
      </div>

      <div className="mt-3 space-y-1 text-xs text-slate-600">
        {results[0]?.metadata.promotion ? (
          <p>
            <b>عرض سعري موثّق:</b> خصم{" "}
            {results[0].metadata.promotion.discountPercent}% —{" "}
            {results[0].metadata.promotion.promoPrice} ج.م بدلاً من{" "}
            {results[0].metadata.promotion.originalPrice} ج.م — حتى{" "}
            {results[0].metadata.promotion.endsAt}
          </p>
        ) : (
          <p>لا يوجد عرض سعري نشط لهذا المنتج؛ النسختان بدون أسعار.</p>
        )}
        {results[0]?.metadata.occasion && (
          <p>
            <b>تهنئة المناسبة:</b> {results[0].metadata.occasion.greeting}
          </p>
        )}
      </div>
    </div>
  );
}
