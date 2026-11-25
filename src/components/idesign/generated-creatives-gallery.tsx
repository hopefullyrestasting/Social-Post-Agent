"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import {
  downloadCreativePng,
  downloadCreativesZip,
  type ExportCreative,
} from "@/lib/al-rahma/export";
import {
  translate,
  type LanguageCode,
  type TranslationKey,
} from "@/lib/al-rahma/i18n";

export interface GalleryProduct {
  id: string;
  name_arabic: string;
  price?: number | null;
  offer_text?: string | null;
  sales_line?: string | null;
}

export interface GalleryCreative {
  id: string;
  product_id: string;
  campaign_id?: string | null;
  variant_number?: number | null;
  image_url?: string | null;
  svg?: string | null;
  product_name_arabic?: string | null;
  brand_arabic?: string | null;
  headline_arabic?: string | null;
  copy_arabic?: string | null;
}

export interface GalleryCampaign {
  id: string;
  campaign_date?: string | null;
  status?: string | null;
  total_images?: number | null;
  creatives: GalleryCreative[];
}

interface Props {
  campaigns: GalleryCampaign[];
  products: GalleryProduct[];
  language: LanguageCode;
  loading?: boolean;
  error?: string;
  onRefresh?: () => void;
}

function toExportCreative(creative: GalleryCreative): ExportCreative {
  return {
    id: creative.id,
    product_id: creative.product_id,
    product_name_arabic: creative.product_name_arabic ?? null,
    variant_number: creative.variant_number ?? null,
    image_url: creative.image_url ?? null,
    svg: creative.svg ?? null,
  };
}

function previewSrc(creative: GalleryCreative): string | null {
  if (creative.image_url && /^data:image\/(svg\+xml|png|jpeg|webp)/i.test(creative.image_url)) {
    return creative.image_url;
  }
  if (/^https?:\/\//i.test(creative.image_url ?? "")) return creative.image_url ?? null;
  if (creative.svg?.trim().startsWith("<svg")) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(creative.svg)}`;
  }
  return null;
}

export default function GeneratedCreativesGallery({
  campaigns,
  products,
  language,
  loading = false,
  error = "",
  onRefresh,
}: Props) {
  const text = (key: TranslationKey) => translate(language, key);
  const [busy, setBusy] = useState("");
  const [localError, setLocalError] = useState("");

  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );

  const groups = useMemo(() => {
    const all = campaigns.flatMap((campaign) =>
      campaign.creatives.map((creative) => ({ ...creative, campaignId: campaign.id })),
    );
    const byProduct = new Map<
      string,
      { name: string; brand: string; items: GalleryCreative[] }
    >();
    for (const creative of all) {
      const existing = byProduct.get(creative.product_id);
      if (existing) {
        existing.items.push(creative);
        continue;
      }
      const product = productById.get(creative.product_id);
      byProduct.set(creative.product_id, {
        name:
          product?.name_arabic ||
          creative.product_name_arabic ||
          translate(language, "creativeProductFallback"),
        brand: creative.brand_arabic ?? "",
        items: [creative],
      });
    }
    for (const group of byProduct.values()) {
      group.items.sort(
        (a, b) => (Number(a.variant_number) || 0) - (Number(b.variant_number) || 0),
      );
    }
    return Array.from(byProduct.entries());
  }, [campaigns, productById, language]);

  const allCreatives = groups.flatMap(([, group]) => group.items);

  async function downloadOne(creative: GalleryCreative) {
    setBusy(creative.id);
    setLocalError("");
    try {
      await downloadCreativePng(toExportCreative(creative));
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : text("downloadImage"));
    } finally {
      setBusy("");
    }
  }

  async function downloadGroup(key: string, items: GalleryCreative[], name: string) {
    setBusy(key);
    setLocalError("");
    try {
      await downloadCreativesZip(
        items.map(toExportCreative),
        `${name}-1080x1920.zip`,
      );
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : text("downloadAllZip"));
    } finally {
      setBusy("");
    }
  }

  return (
    <section
      className="rounded-2xl border-2 border-[#1D4ED8] bg-gradient-to-br from-white to-blue-50 p-5 shadow-sm"
      aria-labelledby="generated-creatives-heading"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="generated-creatives-heading" className="text-xl font-black text-[#1D4ED8]">
            {text("generatedCreativesTitle")}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            {text("generatedCreativesHint")}
          </p>
          <p className="mt-1 text-xs font-bold text-slate-500">
            {allCreatives.length} {text("generatedCount")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-bold text-[#1D4ED8] transition hover:bg-blue-50"
          >
            {text("refreshCreatives")} ↻
          </button>
          <button
            type="button"
            disabled={allCreatives.length === 0 || Boolean(busy)}
            onClick={() =>
              void downloadGroup(
                "all",
                allCreatives,
                `idesign-created-${Date.now()}`,
              )
            }
            className="rounded-lg bg-[#1D4ED8] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#1E40AF] disabled:opacity-50"
          >
            {busy === "all" ? "…" : text("downloadAllZip")}
          </button>
        </div>
      </div>

      {loading ? (
        <p role="status" className="rounded-xl bg-blue-50 p-5 text-center text-sm text-slate-600">
          {text("galleryLoading")}
        </p>
      ) : groups.length === 0 ? (
        <p className="rounded-xl border border-dashed border-blue-200 bg-white p-6 text-center text-sm text-slate-600">
          {text("noGeneratedCreatives")}
        </p>
      ) : (
        <div className="space-y-5">
          {groups.map(([productId, group]) => {
            const product = productById.get(productId);
            const summary = [
              typeof product?.price === "number" && product.price >= 0
                ? `${text("price")}: ${product.price}`
                : "",
              product?.offer_text?.trim()
                ? `${text("offer")}: ${product.offer_text.trim()}`
                : "",
            ].filter(Boolean);
            const zipKey = `zip-${productId}`;
            return (
              <article key={productId} className="rounded-xl border border-blue-100 bg-white p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-black text-slate-900">{group.name}</h3>
                    <p className="text-xs text-slate-500">
                      {group.brand} · {group.items.length} {text("generatedCount")}
                    </p>
                    {summary.length > 0 ? (
                      <p className="mt-1 text-xs font-bold text-[#1D4ED8]">
                        {summary.join(" · ")}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => void downloadGroup(zipKey, group.items, `product-${productId}`)}
                    className="rounded-lg border border-[#1D4ED8] px-3 py-2 text-xs font-bold text-[#1D4ED8] transition hover:bg-blue-50 disabled:opacity-50"
                  >
                    {busy === zipKey ? "…" : text("downloadAllZip")}
                  </button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {group.items.map((creative, index) => {
                    const src = previewSrc(creative);
                    const label = `${text("variantLabel")} ${
                      creative.variant_number ?? index + 1
                    }`;
                    return (
                      <div
                        key={creative.id}
                        className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                      >
                        <p className="mb-2 text-sm font-extrabold text-[#1D4ED8]">{label}</p>
                        {src ? (
                          <Image
                            src={src}
                            alt={`${group.name} — ${label}`}
                            width={300}
                            height={533}
                            loading="lazy"
                            unoptimized
                            className="mx-auto block aspect-[9/16] h-auto w-full max-w-[300px] rounded-lg border border-slate-200 bg-white object-contain"
                          />
                        ) : (
                          <div className="flex aspect-[9/16] items-center justify-center rounded-lg bg-white text-sm text-slate-400">
                            —
                          </div>
                        )}
                        {creative.headline_arabic ? (
                          <p className="mt-2 text-xs text-slate-600" dir="auto">
                            {creative.headline_arabic}
                          </p>
                        ) : null}
                        <button
                          type="button"
                          disabled={Boolean(busy) || !src}
                          onClick={() => void downloadOne(creative)}
                          className="mt-3 w-full rounded-lg bg-[#2563EB] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#1D4ED8] disabled:opacity-50"
                        >
                          {busy === creative.id ? "…" : text("downloadImage")}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {localError || error ? (
        <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {localError || error}
        </p>
      ) : null}
    </section>
  );
}
