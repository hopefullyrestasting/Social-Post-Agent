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

type CompositeAttempt = {
  provider: string;
  model: string;
  status: string;
  errorCode?: string;
};

type ArtDirectionMeta = {
  styleId?: string;
  styleLabelAr?: string;
  styleLabelEn?: string;
  accent?: string;
  engine?: string;
  model?: string;
  cutoutApplied?: boolean;
  stagedProduct?: boolean;
  aiComposite?: boolean;
  backgroundOnly?: boolean;
  compositeProvider?: string | null;
  compositeModel?: string | null;
  compositeFallbackReason?: string | null;
  compositeAttempts?: CompositeAttempt[];
  conditioningCanvas?: boolean;
};

type CampaignCreative = ExportCreative & {
  campaign_id?: string | null;
  variant?: string;
  template?: string;
  style_id?: string | null;
  headline_arabic?: string | null;
  copy_arabic?: string | null;
  socialCaption?: string | null;
  quality_status?: string | null;
  quality_notes?: string | null;
  brand_arabic?: string | null;
  brand_slug?: string | null;
  success?: boolean;
  blockers?: string[];
  art_direction_style?: string | null;
  art_direction_label?: string | null;
  ai_engine?: string | null;
  cutout_applied?: boolean;
  ai_composite?: boolean;
  contains_product?: boolean;
  used_reference?: boolean;
  composite_provider?: string | null;
  composite_model?: string | null;
  composite_fallback_reason?: string | null;
  composite_attempts?: CompositeAttempt[];
  composite_diagnostics?: string[];
  artDirection?: ArtDirectionMeta | null;
};

type Campaign = {
  id: string;
  campaign_date: string;
  status: string;
  total_products: number | null;
  total_images: number | null;
  error_summary?: string | null;
  selected_product_ids?: string[] | string | null;
  creatives: CampaignCreative[];
};

type PlanSlot = {
  slot: number;
  totalSlots: number;
  productId: string;
  product_name_arabic: string;
  brand_arabic: string;
  brand_slug?: string;
  image_url: string;
  variantIndex: 1 | 2;
};

type SlotFailure = {
  slot: number;
  productId: string;
  variantIndex: number;
  product_name_arabic: string;
  error: string;
};

type ApiResult<T> =
  | ({ success: true } & T)
  | { success: false; error?: string; detail?: string; message?: string };

const ART_STYLE_LABELS: Record<string, string> = {
  "coastal-sunlit-stone-caustics": "حجر ساحلي مشمس وانكسارات ضوئية",
  "botanical-horizon-reflection": "أفق نباتي بانعكاس",
  "noir-basalt-golden-rim": "بازلت داكن وإضاءة ذهبية محيطية",
};

const ENGINE_LABELS: Record<string, string> = {
  "cloudflare-ai": "Cloudflare Workers AI",
  "workers-ai-flux": "Workers AI FLUX",
  "gemini-flash-image": "Gemini Flash Image",
  "nano-banana": "Nano Banana",
  "deterministic-studio": "استوديو (خلفية ثابتة)",
  "studio-fallback": "استوديو (خلفية ثابتة)",
  "gemini-image-edit": "Gemini (تحرير مرجعي)",
  "workers-ai-img2img": "Workers AI (تركيب مرجعي)",
  "huggingface-img2img": "Hugging Face (تركيب مرجعي)",
  "reference-conditioned-composite": "تركيب مرجعي (AI)",
};

const VARIANT_LABELS: Record<string, string> = {
  "al-rahma/simple-botanical-horizon": "أفق نباتي بانعكاس",
  "al-rahma/botanical-arch-frame": "حجر ساحلي مشمس وانكسارات ضوئية",
  "al-rahma/editorial-beauty-card": "بازلت داكن وإضاءة ذهبية محيطية",
  "al-rahma/silver-podium-botanical": "أفق نباتي بانعكاس",
  "1": "نسخة 1",
  "2": "نسخة 2",
};

function creativeArtMeta(creative: CampaignCreative): ArtDirectionMeta | null {
  let parsed: Record<string, unknown> = {};
  if (creative.quality_notes) {
    try {
      parsed = JSON.parse(creative.quality_notes) as Record<string, unknown>;
    } catch {
      parsed = {};
    }
  }
  const fromNotes =
    parsed.artDirection && typeof parsed.artDirection === "object"
      ? (parsed.artDirection as ArtDirectionMeta)
      : null;

  const styleId =
    creative.art_direction_style ??
    fromNotes?.styleId ??
    (typeof parsed.styleId === "string" ? parsed.styleId : undefined);
  const engine =
    creative.ai_engine ??
    fromNotes?.engine ??
    (typeof parsed.sceneProvider === "string" ? parsed.sceneProvider : undefined);

  if (!styleId && !engine) return fromNotes ?? null;

  return {
    ...fromNotes,
    styleId: styleId ?? undefined,
    styleLabelAr:
      creative.art_direction_label ??
      fromNotes?.styleLabelAr ??
      (styleId ? ART_STYLE_LABELS[styleId] : undefined),
    engine: engine ?? undefined,
    cutoutApplied: creative.cutout_applied ?? fromNotes?.cutoutApplied,
  };
}

function creativeSvgMarkup(creative: CampaignCreative): string | null {
  return getCreativeSvg(creative);
}

function campaignsUrl(): string {
  return `/api/db/campaigns?limit=10&v=phase18&t=${Date.now()}`;
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

async function loadImageElement(src: string): Promise<HTMLImageElement> {
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("failed to load image"));
    img.src = src;
  });
}

/**
 * Build a 768x1344 (9:16) conditioning canvas for reference-conditioned img2img:
 * neutral studio backdrop with the BRIA cutout placed centered-bottom in the
 * hero area, leaving the upper ~35% open for headline and bottom ~12% for the
 * contact bar. The model paints the outdoor/editorial environment around the
 * authentic bottle while the prompt enforces label/geometry preservation.
 */
function shouldUseProxy(imageUrl: string): boolean {
  if (typeof imageUrl !== "string") return false;
  try {
    const url = new URL(imageUrl);
    // Use proxy for external hosts that may block CORS (penduline.com, cdn.parfoom.com, etc.)
    const blockedHosts = ["penduline.com", "cdn.parfoom.com"];
    return blockedHosts.some((h) => url.hostname.endsWith(h));
  } catch {
    return false;
  }
}

async function buildConditioningCanvas(
  sourceImageUrl: string,
  cutoutDataUrl?: string | null,
): Promise<string | null> {
  if (typeof document === "undefined") return null;
  try {
    const cutout =
      cutoutDataUrl ||
      await (async () => {
        try {
          const effectiveUrl = shouldUseProxy(sourceImageUrl)
            ? `/api/ai/proxy-image?url=${encodeURIComponent(sourceImageUrl)}`
            : sourceImageUrl;
          const res = await fetch("/api/ai/remove-bg", {
            method: "POST",
            headers: adminWriteHeaders({ "Content-Type": "application/json", Accept: "application/json" }),
            body: JSON.stringify({ imageUrl: effectiveUrl }),
          });
          const body = (await res.json()) as { success?: boolean; cutout?: string };
          return body.success && typeof body.cutout === "string" ? body.cutout : null;
        } catch {
          return null;
        }
      })();

    const img = await loadImageElement(cutout || sourceImageUrl);
    const W = 768;
    const H = 1344;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Neutral studio background (prompt-guided outdoor scene remains the fallback path).
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#f8fafc");
    bg.addColorStop(0.55, "#ffffff");
    bg.addColorStop(1, "#eef2f7");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Soft grounding ellipse in lower hero zone.
    ctx.fillStyle = "rgba(148,163,184,0.22)";
    ctx.beginPath();
    ctx.ellipse(W / 2, Math.round(H * 0.82), Math.round(W * 0.28), Math.round(H * 0.03), 0, 0, Math.PI * 2);
    ctx.fill();

    // Place cutout centered-bottom: occupy ~58% of height, bottom near 86%.
    const targetH = Math.round(H * 0.58);
    const scale = targetH / Math.max(1, img.naturalHeight || img.height || 1);
    const drawW = Math.round((img.naturalWidth || img.width || 1) * scale);
    const drawH = targetH;
    const dx = Math.round((W - drawW) / 2);
    const dy = Math.round(H * 0.86 - drawH);
    ctx.drawImage(img, dx, dy, drawW, drawH);

    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
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
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
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

  async function handleCopyCaption() {
    const caption = (creative.socialCaption || creative.copy_arabic || "").trim();
    if (!caption) {
      onError("لا يوجد نص بوست جاهز لنسخ هذا الإعلان.");
      return;
    }
    setCopying(true);
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(caption);
      } else if (typeof document !== "undefined") {
        const ta = document.createElement("textarea");
        ta.value = caption;
        ta.setAttribute("readonly", "true");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      } else {
        throw new Error("clipboard unavailable");
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (err) {
      onError(err instanceof Error ? err.message : "تعذر نسخ نص البوست.");
    } finally {
      setCopying(false);
    }
  }

  const passed = creative.quality_status === "passed" || creative.success;
  const artMeta = creativeArtMeta(creative);
  const aiComposite = Boolean(creative.ai_composite ?? artMeta?.aiComposite);
  const compositeProvider = creative.composite_provider ?? artMeta?.compositeProvider ?? null;
  const compositeModel = creative.composite_model ?? artMeta?.compositeModel ?? null;
  const fallbackReason =
    creative.composite_fallback_reason ?? artMeta?.compositeFallbackReason ?? null;
  const attempts = creative.composite_attempts ?? artMeta?.compositeAttempts ?? [];
  const failedAttempts = attempts.filter((a) => a.status === "failed");

  const styleLabel = artMeta?.styleLabelAr
    ? ART_STYLE_LABELS[artMeta.styleLabelAr] ?? artMeta.styleLabelAr
    : artMeta?.styleId
      ? ART_STYLE_LABELS[artMeta.styleId] ?? artMeta.styleId
      : null;
  const engineLabel = aiComposite
    ? `تركيب مرجعي AI — ${compositeModel || compositeProvider || "model"}`
    : artMeta?.engine
      ? ENGINE_LABELS[artMeta.engine] ?? artMeta.engine
      : null;

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

      {(styleLabel || engineLabel || aiComposite || attempts.length > 0) && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {aiComposite ? (
            <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-bold text-emerald-900">
              ✓ تركيب مرجعي حقيقي (AI)
            </span>
          ) : attempts.length > 0 ? (
            <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-bold text-amber-900">
              بديل: ملصق أصلي فوق خلفية (بدون تركيب AI)
            </span>
          ) : null}
          {styleLabel && (
            <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-800">
              🎨 {styleLabel}
            </span>
          )}
          {engineLabel && (
            <span className="rounded-full bg-sky-50 px-2 py-1 text-[11px] font-bold text-sky-800">
              ⚙️ {engineLabel}
            </span>
          )}
          {artMeta?.cutoutApplied && (
            <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-700">
              ✂️ قص خلفية
            </span>
          )}
          {artMeta?.conditioningCanvas && (
            <span className="rounded-full bg-indigo-50 px-2 py-1 text-[11px] font-bold text-indigo-800">
              🖼️ conditioning 9:16
            </span>
          )}
        </div>
      )}

      {!aiComposite && (fallbackReason || failedAttempts.length > 0) && (
        <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">
          <p className="font-bold">تعذر التركيب المرجعي (AI) — تم استخدام الملصق الأصلي كبديل آمن.</p>
          {fallbackReason ? <p className="mt-1">{fallbackReason}</p> : null}
          {failedAttempts.length > 0 ? (
            <ul className="mt-1 list-disc space-y-0.5 pr-4">
              {failedAttempts.slice(0, 6).map((a, i) => (
                <li key={`${a.provider}-${a.model}-${i}`}>
                  {a.provider} / {a.model}: {a.errorCode || "failed"}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}

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

      <div className="mt-3 space-y-2">
        <button
          type="button"
          onClick={() => void handleCopyCaption()}
          disabled={copying || !(creative.socialCaption || creative.copy_arabic)}
          className="w-full rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-extrabold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {copying ? "جارٍ النسخ..." : copied ? "تم نسخ نص البوست ✓" : "نسخ نص البوست"}
        </button>
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
  const [progress, setProgress] = useState<string>("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [slotFailures, setSlotFailures] = useState<SlotFailure[]>([]);
  const [downloadingZip, setDownloadingZip] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(campaignsUrl(), {
        headers: { Accept: "application/json" },
        cache: "no-store",
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
        const response = await fetch(campaignsUrl(), {
          headers: { Accept: "application/json" },
          cache: "no-store",
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

  async function runSingleSlot(
    slot: PlanSlot,
    campaignId: string,
    conditioningImage: string | null,
  ): Promise<CampaignCreative> {
    const response = await fetch("/api/db/campaigns/run", {
      method: "POST",
      headers: adminWriteHeaders({
        Accept: "application/json",
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        campaignId,
        productId: slot.productId,
        variantIndex: slot.variantIndex,
        ...(conditioningImage ? { conditioningImage } : {}),
      }),
      cache: "no-store",
    });
    const body = (await response.json()) as ApiResult<{
      creative?: CampaignCreative;
    }>;
    if (!response.ok || !body.success || !body.creative) {
      const msg =
        response.status === 401
          ? "المفتاح الإداري مطلوب أو غير صحيح. أدخل المفتاح من أعلى لوحة التحكم."
          : (body as { detail?: string; error?: string }).detail ||
            (body as { error?: string }).error ||
            `تعذر تشغيل الإعلان (${response.status})`;
      throw new Error(msg);
    }
    return body.creative;
  }

  async function runSequentialBatch(fresh = false) {
    setRunning(true);
    setError("");
    setSlotFailures([]);
    setNotice(fresh ? "جارٍ مسح المعاينة وتوليد دفعة جديدة بالتسلسل..." : "");
    setProgress("جارٍ تجهيز خطة الحملة...");

    try {
      const planRes = await fetch("/api/db/campaigns/run", {
        method: "POST",
        headers: adminWriteHeaders({
          Accept: "application/json",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ planOnly: true }),
        cache: "no-store",
      });
      const planBody = (await planRes.json()) as ApiResult<{
        campaign?: Campaign;
        slots?: PlanSlot[];
        totalSlots?: number;
        message?: string;
      }>;

      if (!planRes.ok || !planBody.success) {
        const msg =
          planRes.status === 401
            ? "المفتاح الإداري مطلوب أو غير صحيح. أدخل المفتاح من أعلى لوحة التحكم."
            : (planBody as { detail?: string; error?: string }).detail ||
              (planBody as { error?: string }).error ||
              `تعذر إنشاء خطة الحملة (${planRes.status})`;
        throw new Error(msg);
      }

      const slots = planBody.slots ?? [];
      const campaignId = planBody.campaign?.id;
      const total = planBody.totalSlots ?? slots.length;

      if (!campaignId || slots.length === 0) {
        setNotice(planBody.message || "لا توجد منتجات موثّقة متاحة للتوليد حالياً.");
        await load();
        return;
      }

      // Seed a live campaign shell so results appear progressively.
      setCampaigns((prev) => [
        {
          id: campaignId,
          campaign_date: planBody.campaign?.campaign_date || "",
          status: "running",
          total_products: planBody.campaign?.total_products ?? null,
          total_images: 0,
          selected_product_ids: planBody.campaign?.selected_product_ids ?? null,
          creatives: [],
        },
        ...prev.filter((c) => c.id !== campaignId),
      ]);

      const failures: SlotFailure[] = [];
      const conditioningCache = new Map<string, string | null>();

      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        setProgress(`جاري تصميم الإعلان ${i + 1} من ${total}…`);

        // Build conditioning canvas (768x1344, BRIA cutout at center-bottom) once per product.
        let conditioning: string | null = conditioningCache.get(slot.productId) ?? null;
        if (!conditioningCache.has(slot.productId)) {
          conditioning = await buildConditioningCanvas(slot.image_url);
          conditioningCache.set(slot.productId, conditioning);
        }

        let creative: CampaignCreative | null = null;
        let lastErr = "";
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            creative = await runSingleSlot(slot, campaignId, conditioning);
            break;
          } catch (e) {
            lastErr = e instanceof Error ? e.message : "فشل غير معروف";
            if (attempt === 0) {
              setProgress(`إعادة محاولة الإعلان ${i + 1} من ${total}…`);
            }
          }
        }

        if (creative) {
          setCampaigns((prev) => {
            const idx = prev.findIndex((c) => c.id === campaignId);
            if (idx === -1) return prev;
            const next = [...prev];
            const current = next[idx];
            next[idx] = {
              ...current,
              status: "running",
              total_images: (current.total_images ?? 0) + 1,
              creatives: [...current.creatives, creative as CampaignCreative],
            };
            return next;
          });
        } else {
          failures.push({
            slot: slot.slot,
            productId: slot.productId,
            variantIndex: slot.variantIndex,
            product_name_arabic: slot.product_name_arabic,
            error: lastErr || "تعذر توليد الإعلان",
          });
          setSlotFailures([...failures]);
        }
      }

      setProgress("");
      const okCount = total - failures.length;
      const failNote =
        failures.length > 0
          ? ` — تعذر توليد ${failures.length} إعلان (تم تسجيل السبب لكل خانة).`
          : "";
      setNotice(
        `${fresh ? "تم استبدال المعاينة بدفعة جديدة. " : ""}تم توليد ${okCount} من ${total} إعلاناً بالتسلسل مع حفظ كل إعلان فوراً في D1.${failNote}`,
      );
      await load();
    } catch (err) {
      setProgress("");
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
            بخلفيات استوديو AI وتركيب لصق العبوة والقوالب. التوليد بالتسلسل مع حفظ فوري لكل إعلان.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void runSequentialBatch(true)}
            disabled={running}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-black text-white shadow-sm transition hover:bg-emerald-600 disabled:opacity-50"
          >
            {running ? "جارٍ التوليد..." : "Clear preview and Generate 10 Designs today"}
          </button>
          <button
            type="button"
            onClick={() => void runSequentialBatch(false)}
            disabled={running}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:opacity-50"
          >
            {running ? "جارٍ التوليد..." : "Generate 10 Designs today (5 Photos × 2 Variants)"}
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

      {progress && (
        <div
          role="status"
          className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-4 font-bold text-sky-900"
        >
          {progress}
        </div>
      )}

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

      {slotFailures.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <p className="font-extrabold">إعلانات تعذر توليدها (بعد إعادة محاولة واحدة لكل خانة):</p>
          <ul className="mt-2 list-disc space-y-1 pr-5 text-sm">
            {slotFailures.map((f) => (
              <li key={`${f.slot}-${f.productId}-${f.variantIndex}`}>
                إعلان {f.slot} — {f.product_name_arabic} (نسخة {f.variantIndex}): {f.error}
              </li>
            ))}
          </ul>
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
