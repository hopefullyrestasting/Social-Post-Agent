"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { adminWriteHeaders } from "@/lib/al-rahma/admin-key";
import {
  bestFilenameMatch,
  normalizeMatchText,
  type MatchConfidence,
} from "@/lib/al-rahma/filename-matcher";

/**
 * Product Asset Manager.
 *
 * Manual + bulk packshot uploads that bind a real photo to a D1 product, mark
 * it verified, and make it available to the Phase 18 campaign runner. Images
 * are downscaled in the browser before upload so the same flow works with the
 * embedded fallback when the `PRODUCT_ASSETS` R2 bucket is not bound yet.
 */

type CatalogProduct = {
  id: string;
  name_arabic: string;
  name_english: string | null;
  category: string | null;
  verification_status: string;
  brand_arabic: string;
  brand_english: string | null;
  brand_slug: string;
};

type CatalogCounts = { total: number; verified: number; pending: number };

type CatalogResponse = {
  success?: boolean;
  products?: CatalogProduct[];
  counts?: CatalogCounts;
  error?: string;
};

type UploadResponse = {
  success?: boolean;
  error?: string;
  message?: string;
  cutout?: { requested?: boolean; applied?: boolean; note?: string | null };
  claims?: { inserted?: number };
  asset?: { storage?: string };
};

type PreparedImage = {
  blob: Blob;
  preview: string;
  name: string;
};

type RowStatus = "idle" | "uploading" | "saved" | "error";

type RowState = {
  prepared: PreparedImage | null;
  autoCutout: boolean;
  status: RowStatus;
  message: string;
};

type BulkRow = {
  key: string;
  fileName: string;
  file: File;
  prepared: PreparedImage | null;
  productId: string;
  confidence: MatchConfidence | null;
  matchLabel: string;
  status: "matching" | "ready" | "uploading" | "saved" | "error";
  message: string;
};

const MAX_EDGE = 1400;
const INITIAL_VISIBLE = 12;
const MAX_BULK_FILES = 15;

const EMPTY_ROW: RowState = {
  prepared: null,
  autoCutout: true,
  status: "idle",
  message: "",
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("تعذر قراءة ملف الصورة."));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("تعذر فتح الصورة."));
    image.src = src;
  });
}

/** Downscales and re-encodes a photo so uploads stay fast and D1-safe. */
async function prepareImage(file: File): Promise<PreparedImage> {
  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImageElement(dataUrl);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) throw new Error("أبعاد الصورة غير صالحة.");

  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));

  const context = canvas.getContext("2d");
  if (!context) throw new Error("المتصفح لا يدعم معالجة الصور.");

  const keepPng = file.type === "image/png" && file.size <= 1_200_000;
  if (!keepPng) {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const mime = keepPng ? "image/png" : "image/jpeg";
  let quality = 0.84;
  let preview = canvas.toDataURL(mime, quality);
  if (!keepPng && preview.length > 900_000) {
    quality = 0.7;
    preview = canvas.toDataURL(mime, quality);
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error("تعذر ضغط الصورة."))),
      mime,
      quality,
    );
  });

  const extension = mime === "image/png" ? "png" : "jpg";
  const baseName = file.name.replace(/\.[^.]+$/, "") || "packshot";
  return { blob, preview, name: `${baseName}.${extension}` };
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function confidenceLabel(confidence: MatchConfidence | null): string {
  switch (confidence) {
    case "high":
      return "ثقة عالية";
    case "medium":
      return "ثقة متوسطة";
    case "low":
      return "ثقة منخفضة";
    default:
      return "بدون مطابقة";
  }
}

function confidenceClasses(confidence: MatchConfidence | null): string {
  switch (confidence) {
    case "high":
      return "bg-emerald-100 text-emerald-800";
    case "medium":
      return "bg-amber-100 text-amber-800";
    case "low":
      return "bg-slate-100 text-slate-600";
    default:
      return "bg-slate-100 text-slate-500";
  }
}

const STATUS_LABELS: Record<RowStatus, string> = {
  idle: "جاهز",
  uploading: "جارٍ الحفظ…",
  saved: "تم التوثيق",
  error: "خطأ",
};

async function postAsset(
  productId: string,
  prepared: PreparedImage,
  autoCutout: boolean,
  sourceUrl: string,
): Promise<{ body: UploadResponse; previewMode: boolean }> {
  const form = new FormData();
  form.append("productId", productId);
  form.append("imageFile", prepared.blob, prepared.name);
  form.append("autoCutout", autoCutout ? "true" : "false");
  if (sourceUrl) form.append("sourceUrl", sourceUrl);

  const response = await fetch("/api/assets/upload", {
    method: "POST",
    headers: adminWriteHeaders({ Accept: "application/json" }),
    body: form,
  });

  let body: UploadResponse = {};
  try {
    body = (await response.json()) as UploadResponse;
  } catch {
    body = {};
  }

  if (!response.ok || !body.success) {
    throw new Error(
      response.status === 401
        ? "المفتاح الإداري مطلوب أو غير صحيح. أدخله من أعلى لوحة التحكم."
        : body.error || `تعذر حفظ صورة المنتج (${response.status})`,
    );
  }

  return {
    body,
    previewMode:
      response.headers.get("X-Auth-Mode") === "unconfigured-preview",
  };
}

type Props = {
  pendingCount?: number;
  onVerified: (message: string) => void;
};

export default function ProductAssetManager({ pendingCount, onVerified }: Props) {
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [counts, setCounts] = useState<CatalogCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState("");
  const [pendingOnly, setPendingOnly] = useState(true);
  const [sourceUrl, setSourceUrl] = useState("");
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMessage, setBulkMessage] = useState("");
  const [bulkError, setBulkError] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [sessionVerified, setSessionVerified] = useState(0);
  const bulkInputRef = useRef<HTMLInputElement | null>(null);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/assets/catalog", {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const body = (await response.json()) as CatalogResponse;
      if (!response.ok || !body.success || !body.products) {
        throw new Error(
          body.error || `تعذر تحميل قائمة المنتجات (${response.status})`,
        );
      }
      setCatalog(body.products);
      setCounts(body.counts ?? null);
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "تعذر تحميل قائمة المنتجات من قاعدة البيانات.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const brands = useMemo(() => {
    const map = new Map<string, string>();
    for (const product of catalog) {
      if (product.brand_slug) {
        map.set(product.brand_slug, product.brand_arabic);
      }
    }
    return [...map.entries()]
      .map(([slug, label]) => ({ slug, label }))
      .sort((left, right) => left.label.localeCompare(right.label, "ar"));
  }, [catalog]);

  const filtered = useMemo(() => {
    const needle = normalizeMatchText(query);
    return catalog.filter((product) => {
      if (brand && product.brand_slug !== brand) return false;
      const row = rows[product.id];
      const justSaved = row?.status === "saved";
      if (pendingOnly && product.verification_status === "verified" && !justSaved) {
        return false;
      }
      if (!needle) return true;
      const haystack = normalizeMatchText(
        `${product.name_arabic} ${product.name_english ?? ""} ${product.brand_arabic} ${product.brand_english ?? ""}`,
      );
      return haystack.includes(needle);
    });
  }, [catalog, brand, pendingOnly, query, rows]);

  const visible = filtered.slice(0, visibleCount);

  function updateRow(productId: string, patch: Partial<RowState>) {
    setRows((previous) => ({
      ...previous,
      [productId]: { ...(previous[productId] ?? EMPTY_ROW), ...patch },
    }));
  }

  function markLocallyVerified(productId: string) {
    const wasVerified =
      catalog.find((product) => product.id === productId)?.verification_status ===
      "verified";
    setCatalog((previous) =>
      previous.map((product) =>
        product.id === productId
          ? { ...product, verification_status: "verified" }
          : product,
      ),
    );
    if (!wasVerified) {
      setCounts((previous) =>
        previous
          ? {
              total: previous.total,
              verified: previous.verified + 1,
              pending: Math.max(0, previous.pending - 1),
            }
          : previous,
      );
      setSessionVerified((value) => value + 1);
    }
  }

  async function handleSingleFile(
    event: ChangeEvent<HTMLInputElement>,
    productId: string,
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      updateRow(productId, {
        status: "error",
        message: "اختر ملف صورة (PNG أو JPG أو WEBP).",
      });
      return;
    }

    updateRow(productId, {
      prepared: null,
      status: "idle",
      message: "جارٍ تجهيز الصورة…",
    });

    try {
      const prepared = await prepareImage(file);
      updateRow(productId, { prepared, status: "idle", message: "" });
    } catch (error) {
      updateRow(productId, {
        status: "error",
        message:
          error instanceof Error ? error.message : "تعذر تجهيز الصورة.",
      });
    }
  }

  async function saveProduct(product: CatalogProduct) {
    const row = rows[product.id] ?? EMPTY_ROW;
    if (!row.prepared) {
      setFeedback(`اختر صورة لمنتج «${product.name_arabic}» أولاً.`);
      return;
    }

    const trimmedSource = sourceUrl.trim();
    if (trimmedSource && !isHttpUrl(trimmedSource)) {
      setFeedback("رابط المصدر يجب أن يكون رابط http(s) صالحاً.");
      return;
    }

    updateRow(product.id, { status: "uploading", message: "جارٍ الرفع والتوثيق…" });
    setFeedback("");

    try {
      const { body, previewMode } = await postAsset(
        product.id,
        row.prepared,
        row.autoCutout,
        trimmedSource,
      );
      const cutoutNote = body.cutout?.applied
        ? " تم قص الخلفية تلقائياً."
        : body.cutout?.note
          ? ` ${body.cutout.note}`
          : "";
      const claimsNote =
        (body.claims?.inserted ?? 0) > 0
          ? ` أُضيف ${body.claims?.inserted} ادعاء موثّق.`
          : "";
      const sourceNote = trimmedSource
        ? ""
        : " · بدون رابط مصدر قد توقف بوابة الجودة الإعلان؛ أضف الرابط قبل توليد الحملة.";
      const previewNote = previewMode
        ? " · وضع المعاينة: لم يُربط مفتاح الإدارة بعد."
        : "";
      const message = `${body.message ?? `تم توثيق ${product.name_arabic}.`}${cutoutNote}${claimsNote}${sourceNote}${previewNote}`;

      updateRow(product.id, { status: "saved", message });
      markLocallyVerified(product.id);
      setFeedback(message);
      onVerified(message);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "تعذر حفظ صورة المنتج.";
      updateRow(product.id, { status: "error", message });
      setFeedback(message);
    }
  }

  async function prepareBulkRows(files: File[]) {
    const accepted = files
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, MAX_BULK_FILES);

    if (accepted.length === 0) {
      setBulkError("لم يتم العثور على ملفات صور صالحة.");
      return;
    }

    setBulkError("");
    setBulkMessage("");
    const stamp = Date.now();

    const created: BulkRow[] = accepted.map((file, index) => {
      const best = bestFilenameMatch(file.name, catalog);
      return {
        key: `${stamp}-${index}-${file.name}`,
        fileName: file.name,
        file,
        prepared: null,
        productId:
          best && best.confidence !== "low" ? best.product.id : "",
        confidence: best?.confidence ?? null,
        matchLabel: best
          ? `${best.product.brand_arabic} — ${best.product.name_arabic}`
          : "لا يوجد مطابق في الكتالوج",
        status: "matching",
        message: "",
      };
    });

    setBulkRows((previous) => [...previous, ...created]);

    for (const row of created) {
      try {
        const prepared = await prepareImage(row.file);
        setBulkRows((previous) =>
          previous.map((item) =>
            item.key === row.key
              ? { ...item, prepared, status: "ready" }
              : item,
          ),
        );
      } catch (error) {
        setBulkRows((previous) =>
          previous.map((item) =>
            item.key === row.key
              ? {
                  ...item,
                  status: "error",
                  message:
                    error instanceof Error
                      ? error.message
                      : "تعذر تجهيز الصورة.",
                }
              : item,
          ),
        );
      }
    }
  }

  function handleBulkInput(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    event.target.value = "";
    if (!files || files.length === 0) return;
    void prepareBulkRows(Array.from(files));
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return;
    void prepareBulkRows(Array.from(files));
  }

  async function commitBulk() {
    const targets = bulkRows.filter(
      (row) => row.prepared && row.productId && row.status !== "saved",
    );
    if (targets.length === 0) {
      setBulkMessage(
        "لا توجد مطابقات جاهزة. اختر المنتج يدوياً للصفوف غير المطابقة أولاً.",
      );
      return;
    }

    const trimmedSource = sourceUrl.trim();
    if (trimmedSource && !isHttpUrl(trimmedSource)) {
      setBulkError("رابط المصدر يجب أن يكون رابط http(s) صالحاً.");
      return;
    }

    setBulkBusy(true);
    setBulkMessage("");
    setBulkError("");
    let saved = 0;
    let failed = 0;
    const newlyVerified: string[] = [];

    for (const row of targets) {
      setBulkRows((previous) =>
        previous.map((item) =>
          item.key === row.key ? { ...item, status: "uploading" } : item,
        ),
      );

      try {
        const { body, previewMode } = await postAsset(
          row.productId,
          row.prepared!,
          true,
          trimmedSource,
        );
        saved += 1;
        newlyVerified.push(row.productId);
        setBulkRows((previous) =>
          previous.map((item) =>
            item.key === row.key
              ? {
                  ...item,
                  status: "saved",
                  message:
                    (body.message ?? "تم التوثيق.") +
                    (body.cutout?.applied ? " · قص خلفية" : "") +
                    (previewMode ? " · وضع المعاينة" : ""),
                }
              : item,
          ),
        );
      } catch (error) {
        failed += 1;
        setBulkRows((previous) =>
          previous.map((item) =>
            item.key === row.key
              ? {
                  ...item,
                  status: "error",
                  message:
                    error instanceof Error ? error.message : "تعذر الرفع.",
                }
              : item,
          ),
        );
      }
    }

    for (const productId of new Set(newlyVerified)) {
      markLocallyVerified(productId);
    }

    const summary = `تم توثيق ${saved} صورة${failed > 0 ? ` وفشل ${failed}` : ""}. الصور جاهزة الآن لمولد إعلانات «أفق نباتي بسيط».`;
    setBulkMessage(summary);
    if (saved > 0) onVerified(summary);
    setBulkBusy(false);
  }

  function updateBulkRow(key: string, patch: Partial<BulkRow>) {
    setBulkRows((previous) =>
      previous.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
  }

  function removeBulkRow(key: string) {
    setBulkRows((previous) => previous.filter((item) => item.key !== key));
  }

  const pendingLabel = pendingCount ?? counts?.pending;
  const readyBulkCount = bulkRows.filter(
    (row) => row.prepared && row.productId && row.status !== "saved",
  ).length;

  return (
    <section
      id="product-asset-manager"
      className="rounded-2xl border border-slate-200 bg-white p-5"
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-extrabold">
            📦 إدارة صور وتوثيق المنتجات
            {typeof pendingLabel === "number"
              ? ` (${pendingLabel} منتج بانتظار الصور)`
              : ""}
          </h3>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            ارفع صورة المنتج الأصلية، اقصّ خلفيتها تلقائياً، ووثّقها ليستخدمها
            مولد إعلانات «أفق نباتي بسيط» في الحملة القادمة مباشرة.
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="rounded-full bg-emerald-50 px-3 py-1 font-bold text-emerald-700">
            تم توثيقها الآن: {sessionVerified}
          </span>
          {counts && (
            <span className="text-slate-500">
              موثّق {counts.verified} / {counts.total}
            </span>
          )}
        </div>
      </div>

      {loadError && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {loadError}
        </div>
      )}

      {feedback && (
        <div
          role="status"
          aria-live="polite"
          className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
        >
          {feedback}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm font-semibold text-slate-700">
          البحث
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setVisibleCount(INITIAL_VISIBLE);
            }}
            placeholder="اسم المنتج أو البراند…"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal"
          />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          البراند
          <select
            value={brand}
            onChange={(event) => {
              setBrand(event.target.value);
              setVisibleCount(INITIAL_VISIBLE);
            }}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal"
          >
            <option value="">كل البراندات</option>
            {brands.map((item) => (
              <option key={item.slug} value={item.slug}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-end gap-2 text-sm font-semibold text-slate-700">
          <input
            type="checkbox"
            checked={pendingOnly}
            onChange={(event) => setPendingOnly(event.target.checked)}
            className="mb-2 h-4 w-4"
          />
          <span className="mb-2">عرض ما يحتاج توثيقاً فقط</span>
        </label>
        <div className="flex items-end">
          <button
            type="button"
            onClick={() => void loadCatalog()}
            className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold transition hover:bg-slate-50"
          >
            تحديث القائمة ↻
          </button>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <label className="block text-sm font-semibold text-slate-700">
          رابط مصدر الصور (اختياري — مطلوب لاعتماد الإعلان)
          <input
            type="url"
            dir="ltr"
            value={sourceUrl}
            onChange={(event) => setSourceUrl(event.target.value)}
            placeholder="https://example.com/product-page"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal"
          />
        </label>
        <p className="mt-1 text-xs text-slate-500">
          يُسجَّل كمصدر موثّق للصور المرفوعة. بدون رابط مصدر تُحفظ الصورة
          ويُوثّق المنتج، لكن بوابة الجودة توقف الإعلان حتى إضافة مصدر.
        </p>
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        className={`mt-5 rounded-xl border-2 border-dashed p-4 transition ${
          dragActive
            ? "border-emerald-500 bg-emerald-50"
            : "border-slate-300 bg-slate-50"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-bold">رفع مجمّع (Bulk Match by Filename)</p>
            <p className="mt-1 text-sm text-slate-600">
              أفلت عدة صور هنا أو اختر ملفات — يطابق النظام أسماء الملفات مع
              الكتالوج تلقائياً، وتراجع كل مطابقة قبل الاعتماد.
            </p>
          </div>
          <button
            type="button"
            onClick={() => bulkInputRef.current?.click()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-700"
          >
            اختيار صور متعددة
          </button>
          <input
            ref={bulkInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleBulkInput}
          />
        </div>

        {bulkRows.length > 0 && (
          <div className="mt-4 space-y-3">
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-slate-100 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-right font-semibold">الصورة</th>
                    <th className="px-3 py-2 text-right font-semibold">اسم الملف</th>
                    <th className="px-3 py-2 text-right font-semibold">المنتج في D1</th>
                    <th className="px-3 py-2 text-right font-semibold">المطابقة</th>
                    <th className="px-3 py-2 text-right font-semibold">الحالة</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {bulkRows.map((row) => (
                    <tr key={row.key} className="align-top">
                      <td className="px-3 py-2">
                        {row.prepared ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={row.prepared.preview}
                            alt={row.fileName}
                            className="h-14 w-14 rounded-lg border border-slate-200 bg-white object-contain"
                          />
                        ) : (
                          <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-slate-300 text-[10px] text-slate-400">
                            …
                          </div>
                        )}
                      </td>
                      <td
                        className="max-w-[200px] truncate px-3 py-2 text-xs text-slate-600"
                        title={row.fileName}
                      >
                        {row.fileName}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={row.productId}
                          disabled={row.status === "saved" || row.status === "uploading"}
                          onChange={(event) =>
                            updateBulkRow(row.key, {
                              productId: event.target.value,
                              status: event.target.value ? "ready" : row.status,
                            })
                          }
                          className="w-full min-w-[220px] rounded-lg border border-slate-300 bg-white px-2 py-1.5"
                        >
                          <option value="">— اختر المنتج يدوياً —</option>
                          {catalog.map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.brand_arabic} — {product.name_arabic}
                            </option>
                          ))}
                        </select>
                        {row.matchLabel && !row.productId && (
                          <p className="mt-1 text-[11px] text-amber-700">
                            {row.matchLabel}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${confidenceClasses(row.confidence)}`}
                        >
                          {confidenceLabel(row.confidence)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {row.status === "saved" ? (
                          <span className="font-bold text-emerald-700">تم التوثيق ✓</span>
                        ) : row.status === "error" ? (
                          <span className="font-bold text-red-700">خطأ</span>
                        ) : row.status === "uploading" ? (
                          <span className="text-slate-500">جارٍ الرفع…</span>
                        ) : row.status === "matching" ? (
                          <span className="text-slate-500">جارٍ التحليل…</span>
                        ) : (
                          <span className="text-slate-500">جاهز</span>
                        )}
                        {row.message && (
                          <p className="mt-1 max-w-[220px] text-[11px] text-slate-500">
                            {row.message}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-left">
                        <button
                          type="button"
                          onClick={() => removeBulkRow(row.key)}
                          disabled={row.status === "uploading"}
                          className="text-xs font-bold text-slate-400 transition hover:text-red-600 disabled:opacity-40"
                        >
                          حذف
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void commitBulk()}
                disabled={bulkBusy || readyBulkCount === 0}
                className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-black text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {bulkBusy
                  ? "جارٍ اعتماد الصور…"
                  : `✅ اعتماد ورفع كل المطابقات (${readyBulkCount})`}
              </button>
              <button
                type="button"
                onClick={() => {
                  setBulkRows([]);
                  setBulkMessage("");
                  setBulkError("");
                }}
                disabled={bulkBusy}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold transition hover:bg-slate-50 disabled:opacity-50"
              >
                مسح القائمة
              </button>
              {bulkMessage && (
                <span className="text-sm font-semibold text-emerald-700">
                  {bulkMessage}
                </span>
              )}
              {bulkError && (
                <span className="text-sm font-semibold text-red-700">{bulkError}</span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="mt-5">
        {loading ? (
          <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            جارٍ تحميل المنتجات من D1…
          </p>
        ) : filtered.length === 0 ? (
          <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            لا توجد منتجات مطابقة للفلاتر الحالية. جرّب إلغاء «عرض ما يحتاج
            توثيقاً فقط».
          </p>
        ) : (
          <>
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {visible.map((product) => {
                const row = rows[product.id] ?? EMPTY_ROW;
                const isVerified =
                  product.verification_status === "verified" ||
                  row.status === "saved";
                return (
                  <li
                    key={product.id}
                    className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {row.prepared ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={row.prepared.preview}
                          alt={product.name_arabic}
                          className="h-16 w-16 shrink-0 rounded-lg border border-slate-200 bg-white object-contain"
                        />
                      ) : (
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-300 text-[10px] text-slate-400">
                          لا صورة
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className="truncate font-bold"
                            title={product.name_arabic}
                          >
                            {product.name_arabic}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                            {product.brand_arabic}
                          </span>
                          {isVerified && (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                              موثّق ✓
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {product.category || "بدون فئة"}
                          {product.name_english ? ` · ${product.name_english}` : ""}
                        </p>
                        {row.message && (
                          <p
                            className={`mt-1 line-clamp-2 text-xs ${
                              row.status === "error"
                                ? "text-red-700"
                                : row.status === "saved"
                                  ? "text-emerald-700"
                                  : "text-slate-500"
                            }`}
                          >
                            {row.message}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <label className="inline-flex cursor-pointer items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold transition hover:bg-slate-50">
                        اختيار صورة
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(event) =>
                            void handleSingleFile(event, product.id)
                          }
                        />
                      </label>
                      <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                        <input
                          type="checkbox"
                          checked={row.autoCutout}
                          onChange={(event) =>
                            updateRow(product.id, {
                              autoCutout: event.target.checked,
                            })
                          }
                          className="h-4 w-4"
                        />
                        قص الخلفية تلقائياً
                      </label>
                      <button
                        type="button"
                        onClick={() => void saveProduct(product)}
                        disabled={
                          !row.prepared ||
                          row.status === "uploading" ||
                          row.status === "saved"
                        }
                        className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {row.status === "uploading"
                          ? "جارٍ الحفظ…"
                          : row.status === "saved"
                            ? "تم الحفظ ✓"
                            : "حفظ وتوثيق"}
                      </button>
                      <span
                        className={`text-[11px] font-bold ${
                          row.status === "error"
                            ? "text-red-700"
                            : row.status === "saved"
                              ? "text-emerald-700"
                              : "text-slate-400"
                        }`}
                      >
                        {STATUS_LABELS[row.status]}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>

            {visible.length < filtered.length && (
              <div className="mt-3 text-center">
                <button
                  type="button"
                  onClick={() =>
                    setVisibleCount((value) => value + INITIAL_VISIBLE)
                  }
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold transition hover:bg-slate-50"
                >
                  عرض المزيد ({filtered.length - visible.length} متبقٍ)
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
