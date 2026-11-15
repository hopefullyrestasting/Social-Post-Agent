"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { adminWriteHeaders } from "@/lib/al-rahma/admin-key";
import {
  creativeFilename,
  downloadCreativePng,
  downloadCreativesZip,
  getCreativePngDataUrl,
  getCreativeSvg,
  type ExportCreative,
} from "@/lib/al-rahma/export";

type CampaignCreative = ExportCreative & {
  campaign_id?: string | null;
  variant?: string;
  template?: string;
  headline_arabic?: string | null;
  copy_arabic?: string | null;
  quality_status?: string | null;
  brand_arabic?: string | null;
  brand_slug?: string | null;
  success?: boolean;
  blockers?: string[];
};

type Campaign = {
  id: string;
  campaign_date: string;
  status: string;
  total_products: number | null;
  total_images: number | null;
  error_summary?: string | null;
  created_at?: number | null;
  creatives: CampaignCreative[];
};

type ApiResult<T> =
  | ({ success: true } & T)
  | { success: false; error?: string; detail?: string; message?: string };

const VARIANT_LABELS: Record<string, string> = {
  "silver-podium-botanical": "نسخة 1 — منصة فضية ونباتات",
  "botanical-arch-frame": "نسخة 2 — إطار قوسي نباتي",
  "editorial-beauty-card": "نسخة 2 — بطاقة تحريرية تجميلية",
  "1": "نسخة 1 — منصة فضية ونباتات",
  "2": "نسخة 2 — قالب بديل",
};

function creativeSvgMarkup(creative: CampaignCreative): string | null {
  return getCreativeSvg(creative);
}

function groupByProduct(creatives: CampaignCreative[]) {
  const groups = new Map<
    string,
    { name: string; brand: string; items: CampaignCreative[] }
  >();
  for (const creative of creatives) {
    const key = creative.product_id || creative.id;
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(creative);
    } else {
      groups.set(key, {
        name: creative.product_name_arabic || key,
        brand: creative.brand_arabic || "",
        items: [creative],
      });
    }
  }
  for (const group of groups.values()) {
    group.items.sort(
      (a, b) => (Number(a.variant_number) || 0) - (Number(b.variant_number) || 0),
    );
  }
  return Array.from(groups.entries());
}

function CreativeCard({
  creative,
  label,
  onError,
}: {
  creative: CampaignCreative;
  label: string;
  onError: (message: string) => void;
}) {
  const svg = creativeSvgMarkup(creative);
  const [pngUrl, setPngUrl] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [renderError, setRenderError] = useState("");

  useEffect(() => {
    if (!svg) return;
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      setRendering(true);
      setRenderError("");
      setPngUrl(null);
    });
    getCreativePngDataUrl(creative)
      .then((url: string | null) => {
        if (!active) return;
        setPngUrl(url);
        if (!url) setRenderError("تعذر تجهيز المعاينة كصورة PNG.");
      })
      .catch(() => {
        if (!active) return;
        setRenderError("تعذر تجهيز المعاينة كصورة PNG.");
      })
      .finally(() => {
        if (active) setRendering(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creative.id, svg]);

  async function handleDownload() {
    if (!svg) return;
    setDownloading(true);
    try {
      await downloadCreativePng(creative);
    } catch (err) {
      onError(err instanceof Error ? err.message : "تعذر تنزيل الصورة.");
    } finally {
      setDownloading(false);
    }
  }

  const passed = creative.quality_status === "passed" || creative.success;

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-extrabold">{label}</p>
        <span
          className={`rounded-full px-2 py-1 text-xs font-bold ${
            passed ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"
          }`}
        >
          {passed ? "جاهز للنشر" : "يحتاج مراجعة"}
        </span>
      </div>

      {pngUrl ? (
        <img
          src={pngUrl}
          alt={`${creative.headline_arabic || creative.product_name_arabic || "إعلان"} — ${label}`}
          width={1080}
          height={1920}
          loading="lazy"
          className="block h-auto w-full overflow-hidden rounded-lg border border-slate-200 bg-white"
        />
      ) : svg ? (
        <div className="flex aspect-[9/16] w-full items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-600">
          {rendering ? "جارٍ تجهيز الصورة كاملة (قص الخلفية وتركيب الملصق)..." : renderError || "المعاينة غير متاحة."}
        </div>
      ) : (
        <p className="text-sm text-slate-500">معاينة غير متاحة.</p>
      )}

      {creative.headline_arabic && (
        <p className="mt-2 text-xs text-slate-600">{creative.headline_arabic}</p>
      )}

      <div className="mt-3">
        <button
          type="button"
          onClick={() => void handleDownload()}
          disabled={downloading || !svg}
          className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {downloading ? "جارٍ تجهيز التحميل..." : "تحميل الصورة كاملة (PNG)"}
        </button>
        <p className="mt-1 text-center text-[11px] text-slate-500">
          1080×1920 — {creativeFilename(creative)}
        </p>
      </div>
    </article>
  );
}

export default function CampaignGallery() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [downloadingZip, setDownloadingZip] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/db/campaigns?limit=10", {
        headers: { Accept: "application/json" },
      });
      const body = (await response.json()) as ApiResult<{ campaigns: Campaign[] }>;
      if (!response.ok || !body.success) {
        throw new Error((body as { error?: string }).error || "تعذر تحميل الحملات.");
      }
      setCampaigns(body.campaigns ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحميل الحملات.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      setError("");
      try {
        const response = await fetch("/api/db/campaigns?limit=10", {
          headers: { Accept: "application/json" },
        });
        const body = (await response.json()) as ApiResult<{ campaigns: Campaign[] }>;
        if (!response.ok || !body.success) {
          throw new Error((body as { error?: string }).error || "تعذر تحميل الحملات.");
        }
        if (active) setCampaigns(body.campaigns ?? []);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "تعذر تحميل الحملات.");
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function runBatch() {
    setRunning(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/db/campaigns/run", {
        method: "POST",
        headers: adminWriteHeaders({
          Accept: "application/json",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({}),
      });
      const body = (await response.json()) as ApiResult<{
        campaign?: Campaign;
        creatives?: CampaignCreative[];
        message?: string;
      }>;

      if (!response.ok || !body.success) {
        throw new Error(
          response.status === 401
            ? "المفتاح الإداري مطلوب أو غير صحيح. أدخل المفتاح من أعلى لوحة التحكم."
            : (body as { detail?: string; error?: string }).detail ||
                (body as { error?: string }).error ||
                `تعذر تشغيل الدفعة (${response.status})`,
        );
      }

      const previewNote =
        response.headers.get("X-Auth-Mode") === "unconfigured-preview"
          ? " — وضع المعاينة: لم يُضبط مفتاح الإدارة بعد."
          : "";
      setNotice(`${body.message || "تم تشغيل دفعة اليوم بنجاح."}${previewNote}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تشغيل الدفعة.");
    } finally {
      setRunning(false);
    }
  }

  async function handleDownloadZip(campaign: Campaign) {
    const key = `zip-${campaign.id}`;
    setDownloadingZip(key);
    setError("");
    try {
      await downloadCreativesZip(
        campaign.creatives,
        `campaign-${campaign.campaign_date || campaign.id}.zip`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تنزيل ملف ZIP.");
    } finally {
      setDownloadingZip("");
    }
  }

  const latest = campaigns[0] ?? null;
  const latestGroups = useMemo(
    () => (latest ? groupByProduct(latest.creatives) : []),
    [latest],
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-extrabold">معرض الحملات وتوليد دفعة اليوم</h3>
          <p className="mt-1 text-sm text-slate-500">
            توليد يدوي لدفعة يومية: حتى 5 منتجات موثّقة × نسختين (10 إعلانات 1080×1920)
            بخلفيات استوديو AI وتركيب قصّ العبوة والهوية. لا يوجد تشغيل تلقائي (Cron).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={runBatch}
            disabled={running}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:opacity-50"
          >
            {running ? "جارٍ التوليد..." : "توليد دفعة اليوم (5 منتجات × نسختين)"}
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold transition hover:bg-slate-50"
          >
            تحديث الحملات ↻
          </button>
        </div>
      </div>

      {notice && (
        <div
          role="status"
          className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900"
        >
          {notice}
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800"
        >
          {error}
        </div>
      )}

      {loading ? (
        <p className="py-6 text-center text-slate-500">جارٍ تحميل الحملات...</p>
      ) : campaigns.length === 0 ? (
        <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
          لا توجد حملات مسجلة بعد. اضغط «توليد دفعة اليوم» بعد توثيق منتجات وصور مرجعية.
        </p>
      ) : (
        <div className="space-y-6">
          {latest && (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/30 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-extrabold">آخر حملة — {latest.campaign_date}</p>
                  <p className="text-sm text-slate-600">
                    الحالة: {latest.status} — المنتجات: {latest.total_products ?? 0} —
                    الإعلانات: {latest.total_images ?? latest.creatives.length}
                  </p>
                  {latest.error_summary && (
                    <p className="mt-1 text-sm text-amber-800">{latest.error_summary}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void handleDownloadZip(latest)}
                  disabled={
                    downloadingZip === `zip-${latest.id}` || latest.creatives.length === 0
                  }
                  className="rounded-lg bg-slate-900 px-5 py-3 text-sm font-extrabold text-white transition hover:bg-slate-800 disabled:opacity-50"
                >
                  {downloadingZip === `zip-${latest.id}`
                    ? "جارٍ تجهيز ZIP..."
                    : `تحميل الكل (ZIP) — ${latest.creatives.length} إعلان`}
                </button>
              </div>

              {latestGroups.length === 0 ? (
                <p className="text-sm text-slate-600">لا توجد إعلانات في هذه الحملة.</p>
              ) : (
                <div className="space-y-5">
                  {latestGroups.map(([productId, group]) => (
                    <div
                      key={productId}
                      className="rounded-xl border border-slate-200 bg-white p-3"
                    >
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <h4 className="font-bold">
                          {group.name}{" "}
                          {group.brand ? (
                            <span className="text-slate-500">— {group.brand}</span>
                          ) : null}
                        </h4>
                        <span className="text-xs text-slate-500">
                          {group.items.length} إعلان
                        </span>
                      </div>
                      <div className="grid gap-4 lg:grid-cols-2">
                        {group.items.map((creative) => {
                          const templateKey = String(
                            creative.variant ??
                              creative.template ??
                              creative.variant_number ??
                              "",
                          );
                          const label =
                            VARIANT_LABELS[templateKey] ||
                            VARIANT_LABELS[String(creative.variant_number ?? "")] ||
                            `نسخة ${creative.variant_number ?? "?"}`;
                          return (
                            <CreativeCard
                              key={creative.id}
                              creative={creative}
                              label={label}
                              onError={setError}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {campaigns.length > 1 && (
            <details className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <summary className="cursor-pointer font-bold">
                حملات سابقة ({campaigns.length - 1})
              </summary>
              <ul className="mt-3 space-y-2 text-sm text-slate-700">
                {campaigns.slice(1).map((campaign) => (
                  <li
                    key={campaign.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3"
                  >
                    <span>
                      {campaign.campaign_date} — {campaign.status} —{" "}
                      {campaign.total_products ?? 0} منتج —{" "}
                      {campaign.total_images ?? campaign.creatives.length} إعلان
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleDownloadZip(campaign)}
                      disabled={
                        downloadingZip === `zip-${campaign.id}` ||
                        campaign.creatives.length === 0
                      }
                      className="font-bold text-emerald-700 underline disabled:opacity-50"
                    >
                      {downloadingZip === `zip-${campaign.id}` ? "..." : "تحميل الكل (ZIP)"}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
