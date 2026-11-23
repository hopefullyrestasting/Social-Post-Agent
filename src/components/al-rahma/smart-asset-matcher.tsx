"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { adminWriteHeaders } from "@/lib/al-rahma/admin-key";
import type { MatchConfidence } from "@/lib/al-rahma/filename-matcher";

/**
 * Smart Vision Asset Matcher.
 *
 * Drop unorganized phone/WhatsApp photos: each one is read by Vision AI
 * (`/api/assets/vision-match`), matched to a D1 product, and shown in a review
 * table. One click commits every approved row through
 * `/api/assets/commit-match`, which cuts out the background, stores the image,
 * and verifies the product for the Phase 18 campaign runner.
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

type VisionProvider = "gemini" | "workers-ai" | "filename" | "none";

type VisionCandidate = {
  productId: string;
  name_arabic: string;
  brand_arabic: string;
  score: number;
  confidence: MatchConfidence;
};

type VisionMatch = {
  productId: string | null;
  confidence: MatchConfidence;
  detectedLabel: string;
  detectedBrand: string;
  detectedType: string;
  provider: VisionProvider;
  reasoning?: string;
  product?: {
    id: string;
    name_arabic: string;
    brand_arabic: string;
    brand_slug: string;
  } | null;
  candidates?: VisionCandidate[];
};

type VisionResponse = {
  success?: boolean;
  error?: string;
  match?: VisionMatch;
  note?: string;
  message?: string;
  vision?: {
    geminiConfigured?: boolean;
    workersAiBound?: boolean;
    provider?: VisionProvider;
  };
};

type CommitResponse = {
  success?: boolean;
  error?: string;
  message?: string;
  cutout?: { requested?: boolean; applied?: boolean; note?: string | null };
  provenance?: { quality_gate_ready?: boolean };
  asset?: { storage?: string };
};

type PreparedImage = {
  blob: Blob;
  dataUrl: string;
  name: string;
};

type RowStatus =
  | "scanning"
  | "ready"
  | "committing"
  | "saved"
  | "error";

type SmartRow = {
  key: string;
  fileName: string;
  prepared: PreparedImage | null;
  status: RowStatus;
  productId: string;
  autoCutout: boolean;
  match: VisionMatch | null;
  note: string;
  message: string;
};

const MAX_EDGE = 1400;
const MAX_FILES = 12;

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

/** Downscales and re-encodes a photo so vision + commit stay fast and D1-safe. */
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
  let encoded = canvas.toDataURL(mime, quality);
  if (!keepPng && encoded.length > 900_000) {
    quality = 0.7;
    encoded = canvas.toDataURL(mime, quality);
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) =>
        value ? resolve(value) : reject(new Error("تعذر ضغط الصورة.")),
      mime,
      quality,
    );
  });

  const extension = mime === "image/png" ? "png" : "jpg";
  const baseName = file.name.replace(/\.[^.]+$/, "") || "packshot";
  return { blob, dataUrl: encoded, name: `${baseName}.${extension}` };
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

function providerLabel(provider: VisionProvider | undefined): string {
  switch (provider) {
    case "gemini":
      return "قراءة بصرية · Gemini";
    case "workers-ai":
      return "قراءة بصرية · Workers AI";
    case "filename":
      return "مطابقة من اسم الملف";
    default:
      return "بدون قراءة";
  }
}

async function scanAsset(
  prepared: PreparedImage,
  fileName: string,
): Promise<{ match: VisionMatch; note: string; message: string }> {
  const form = new FormData();
  form.append("imageFile", prepared.blob, prepared.name);
  form.append("fileName", fileName);

  const response = await fetch("/api/assets/vision-match", {
    method: "POST",
    headers: adminWriteHeaders({ Accept: "application/json" }),
    body: form,
  });

  let body: VisionResponse = {};
  try {
    body = (await response.json()) as VisionResponse;
  } catch {
    body = {};
  }

  if (!response.ok || !body.success || !body.match) {
    throw new Error(
      response.status === 401
        ? "المفتاح الإداري مطلوب أو غير صحيح. أدخله من أعلى لوحة التحكم."
        : body.error || `تعذر فحص الصورة (${response.status})`,
    );
  }

  return {
    match: body.match,
    note: body.note ?? "",
    message: body.message ?? "",
  };
}

async function commitAsset(
  productId: string,
  prepared: PreparedImage,
  autoCutout: boolean,
  sourceUrl: string,
): Promise<CommitResponse & { autoCreated?: boolean; product?: { id: string; name_arabic?: string } }> {
  if (!productId) {
    const form = new FormData();
    form.append("imageFile", prepared.blob, prepared.name);
    form.append("autoCutout", autoCutout ? "true" : "false");
    form.append("autoCreate", "true");
    if (sourceUrl) form.append("sourceUrl", sourceUrl);
    const response = await fetch("/api/assets/upload", {
      method: "POST",
      headers: adminWriteHeaders({ Accept: "application/json" }),
      body: form,
    });
    let body: Record<string, unknown> = {};
    try { body = (await response.json()) as Record<string, unknown>; } catch { body = {}; }
    if (!response.ok || !body.success) {
      throw new Error(String(body.error || `تعذر إنشاء المنتج واعتماد الصورة (${response.status})`));
    }
    return body as CommitResponse & { autoCreated?: boolean; product?: { id: string; name_arabic?: string } };
  }

  const response = await fetch("/api/assets/commit-match", {
    method: "POST",
    headers: adminWriteHeaders({
      Accept: "application/json",
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({
      productId,
      imageDataUrl: prepared.dataUrl,
      autoCutout,
      sourceUrl: sourceUrl || undefined,
      fileName: prepared.name,
    }),
  });

  let body: CommitResponse = {};
  try {
    body = (await response.json()) as CommitResponse;
  } catch {
    body = {};
  }

  if (!response.ok || !body.success) {
    throw new Error(
      response.status === 401
        ? "المفتاح الإداري مطلوب أو غير صحيح. أدخله من أعلى لوحة التحكم."
        : body.error || `تعذر اعتماد الصورة (${response.status})`,
    );
  }

  return body;
}

type Props = {
  pendingCount?: number;
  onVerified: (message: string) => void;
};

export default function SmartAssetMatcher({ pendingCount, onVerified }: Props) {
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [counts, setCounts] = useState<CatalogCounts | null>(null);
  const [catalogError, setCatalogError] = useState("");
  const [rows, setRows] = useState<SmartRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [sourceUrl, setSourceUrl] = useState("");
  const [feedback, setFeedback] = useState("");
  const [batchMessage, setBatchMessage] = useState("");
  const [batchError, setBatchError] = useState("");
  const [visionNotice, setVisionNotice] = useState("");
  const [sessionVerified, setSessionVerified] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadCatalog() {
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
        if (cancelled) return;
        setCatalog(body.products);
        setCounts(body.counts ?? null);
        setCatalogError("");
      } catch (error) {
        if (cancelled) return;
        setCatalogError(
          error instanceof Error
            ? error.message
            : "تعذر تحميل قائمة المنتجات من قاعدة البيانات.",
        );
      }
    }

    void loadCatalog();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  function refreshCatalog() {
    setCatalogError("");
    setRefreshKey((value) => value + 1);
  }

  const productById = useMemo(() => {
    const map = new Map<string, CatalogProduct>();
    for (const product of catalog) map.set(product.id, product);
    return map;
  }, [catalog]);

  function patchRow(key: string, patch: Partial<SmartRow>) {
    setRows((previous) =>
      previous.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  function markLocallyVerified(productId: string) {
    const product = productById.get(productId);
    const wasVerified = product?.verification_status === "verified";
    setCatalog((previous) =>
      previous.map((item) =>
        item.id === productId
          ? { ...item, verification_status: "verified" }
          : item,
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

  async function addFiles(files: File[]) {
    const accepted = files
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, MAX_FILES);

    if (accepted.length === 0) {
      setBatchError("لم يتم العثور على ملفات صور صالحة.");
      return;
    }

    setBatchError("");
    setBatchMessage("");
    setFeedback("");
    setBusy(true);

    const stamp = Date.now();
    const pendingItems = accepted.map((file, index) => {
      const row: SmartRow = {
        key: `${stamp}-${index}-${file.name}`,
        fileName: file.name,
        prepared: null,
        status: "scanning",
        productId: "",
        autoCutout: true,
        match: null,
        note: "",
        message: "جارٍ تجهيز الصورة…",
      };
      return { row, file };
    });

    setRows((previous) => [...previous, ...pendingItems.map((item) => item.row)]);

    for (const { row, file } of pendingItems) {
      try {
        const prepared = await prepareImage(file);
        patchRow(row.key, {
          prepared,
          message: "جارٍ قراءة العبوة بالذكاء الاصطناعي…",
        });

        const scan = await scanAsset(prepared, row.fileName);
        patchRow(row.key, {
          status: "ready",
          match: scan.match,
          productId: scan.match.productId ?? "",
          note: scan.note,
          message: scan.match.productId
            ? scan.message
            : "لم تُطابق تلقائياً — اختر المنتج يدوياً.",
        });
        setVisionNotice(scan.note);
      } catch (error) {
        patchRow(row.key, {
          status: "error",
          message:
            error instanceof Error ? error.message : "تعذر فحص الصورة.",
        });
      }
    }

    setBusy(false);
  }

  function handleInput(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    event.target.value = "";
    if (!files || files.length === 0) return;
    const tooMany = files.length > MAX_FILES;
    void addFiles(Array.from(files));
    if (tooMany) {
      setBatchError(
        `تم اختيار ${files.length} صورة. الحد الأقصى ${MAX_FILES} صورة في الدفعة الواحدة.`,
      );
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    if (busy) return;
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return;
    void addFiles(Array.from(files));
  }

  async function commitAll() {
    const targets = rows.filter(
      (row) => row.prepared && row.status === "ready" && (row.productId !== undefined),
    );
    if (targets.length === 0) {
      setBatchMessage(
        "لا توجد صفوف جاهزة للاعتماد. اختر منتجاً أو استخدم إنشاء منتج جديد.",
      );
      return;
    }

    const trimmedSource = sourceUrl.trim();
    if (trimmedSource && !isHttpUrl(trimmedSource)) {
      setBatchError("رابط المصدر يجب أن يكون رابط http(s) صالحاً.");
      return;
    }

    setBusy(true);
    setBatchError("");
    setBatchMessage("");
    setFeedback("");

    let saved = 0;
    let failed = 0;
    const verifiedIds: string[] = [];
    const cutoutCount = { applied: 0, skipped: 0 };

    for (const row of targets) {
      patchRow(row.key, { status: "committing", message: "جارٍ القص والحفظ في D1…" });
      try {
        const body = await commitAsset(
          row.productId,
          row.prepared!,
          row.autoCutout,
          trimmedSource,
        );
        saved += 1;
        const resolvedProductId = row.productId || body.product?.id || "";
        if (resolvedProductId) verifiedIds.push(resolvedProductId);
        if (body.cutout?.applied) cutoutCount.applied += 1;
        else cutoutCount.skipped += 1;

        const cutoutNote = body.cutout?.applied
          ? " · قص خلفية شفاف"
          : body.cutout?.note
            ? ` · ${body.cutout.note}`
            : "";
        const provenanceNote = body.autoCreated
          ? " · تم إنشاء منتج جديد تلقائياً"
          : body.provenance?.quality_gate_ready
            ? ""
            : " · بدون رابط مصدر قد توقف بوابة الجودة الإعلان";
        patchRow(row.key, {
          status: "saved",
          productId: row.productId || body.product?.id || row.productId,
          message: `${body.message ?? "تم الاعتماد."}${cutoutNote}${provenanceNote}`,
        });
        if (body.autoCreated && body.product?.id) {
          const newId = body.product.id;
          const newName = body.product.name_arabic || row.fileName;
          setCatalog((prev) => prev.some((p) => p.id === newId) ? prev : [...prev, { id: newId, name_arabic: newName, name_english: null, category: null, verification_status: "verified", brand_arabic: "", brand_english: null, brand_slug: "" }]);
        }
      } catch (error) {
        failed += 1;
        patchRow(row.key, {
          status: "error",
          message:
            error instanceof Error ? error.message : "تعذر اعتماد الصورة.",
        });
      }
    }

    for (const productId of new Set(verifiedIds)) {
      markLocallyVerified(productId);
    }

    const summary = `تم اعتماد ${saved} صورة${failed > 0 ? ` وفشل ${failed}` : ""} · قص خلفية شفاف لـ ${cutoutCount.applied}${
      cutoutCount.skipped > 0 ? ` واحتُفظ بالأصل لـ ${cutoutCount.skipped}` : ""
    }. الصور متاحة الآن لمولد «أفق نباتي بسيط».`;
    setBatchMessage(summary);
    setFeedback(summary);
    if (saved > 0) onVerified(summary);
    setBusy(false);
  }

  function removeRow(key: string) {
    setRows((previous) => previous.filter((row) => row.key !== key));
  }

  function clearRows() {
    setRows([]);
    setBatchMessage("");
    setBatchError("");
    setFeedback("");
  }

  const readyCount = rows.filter(
    (row) => row.prepared && row.productId && row.status === "ready",
  ).length;
  const total = counts?.total ?? catalog.length;
  const verified = counts?.verified ?? 0;
  const pending = pendingCount ?? counts?.pending ?? Math.max(0, total - verified);

  return (
    <section
      id="smart-asset-matcher"
      className="rounded-2xl border border-slate-200 bg-white p-5"
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-extrabold">
            📸 المطابق الذكي لصور المنتجات (ارفع الصور بدون إعادة تسمية)
          </h3>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            أفلت صور الموبايل أو واتساب كما هي. الذكاء الاصطناعي يقرأ اسم
            البراند والمنتج على العبوة، يطابقها مع منتجات D1، ثم تعتمد كل
            الصور دفعة واحدة بقص خلفية شفاف وتوثيق فوري للمنتج.
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {pending} منتج بانتظار الصور · موثّق {verified} من {total}
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="rounded-full bg-emerald-50 px-3 py-1 font-bold text-emerald-700">
            تم توثيقها الآن: {sessionVerified}
          </span>
          <button
            type="button"
            onClick={refreshCatalog}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold transition hover:bg-slate-50"
          >
            تحديث الكتالوج ↻
          </button>
        </div>
      </div>

      {catalogError && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {catalogError}
        </div>
      )}

      {visionNotice && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {visionNotice}
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

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
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
          يُسجَّل كمصدر موثّق لكل الصور المعتمدة في هذه الدفعة. بدونه تُحفظ
          الصور وتُوثّق المنتجات، لكن بوابة الجودة توقف الإعلان حتى إضافة مصدر.
        </p>
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy) setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        className={`mt-4 rounded-xl border-2 border-dashed p-5 text-center transition ${
          dragActive
            ? "border-emerald-500 bg-emerald-50"
            : "border-slate-300 bg-slate-50"
        }`}
      >
        <p className="font-bold">أفلت صور المنتجات هنا</p>
        <p className="mt-1 text-sm text-slate-600">
          PNG · JPG · WEBP — حتى {MAX_FILES} صورة في الدفعة. لا حاجة لإعادة
          تسمية الملفات.
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-bold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "جارٍ فحص الصور…" : "اختيار صور متعددة"}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleInput}
          />
        </div>
      </div>

      {rows.length > 0 && (
        <div className="mt-5 space-y-3">
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-right font-semibold">الصورة</th>
                  <th className="px-3 py-2 text-right font-semibold">
                    اسم الملف
                  </th>
                  <th className="px-3 py-2 text-right font-semibold">
                    النص المقروء على العبوة
                  </th>
                  <th className="px-3 py-2 text-right font-semibold">
                    المنتج في D1
                  </th>
                  <th className="px-3 py-2 text-right font-semibold">الثقة</th>
                  <th className="px-3 py-2 text-right font-semibold">
                    قص الخلفية
                  </th>
                  <th className="px-3 py-2 text-right font-semibold">الحالة</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => {
                  const selectedProduct = productById.get(row.productId);
                  return (
                    <tr key={row.key} className="align-top">
                      <td className="px-3 py-2">
                        {row.prepared ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={row.prepared.dataUrl}
                            alt={row.fileName}
                            className="h-16 w-16 rounded-lg border border-slate-200 bg-white object-contain"
                          />
                        ) : (
                          <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-slate-300 text-[10px] text-slate-400">
                            …
                          </div>
                        )}
                      </td>
                      <td
                        className="max-w-[160px] truncate px-3 py-2 text-xs text-slate-500"
                        title={row.fileName}
                      >
                        {row.fileName}
                      </td>
                      <td className="max-w-[240px] px-3 py-2">
                        {row.match?.detectedLabel ? (
                          <p className="font-semibold text-slate-800">
                            {row.match.detectedLabel}
                          </p>
                        ) : (
                          <p className="text-xs text-slate-400">
                            لم يُقرأ نص واضح
                          </p>
                        )}
                        {(row.match?.detectedBrand ||
                          row.match?.detectedType) && (
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            {[row.match?.detectedBrand, row.match?.detectedType]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        )}
                        <p className="mt-1 text-[10px] text-slate-400">
                          {providerLabel(row.match?.provider)}
                        </p>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={row.productId}
                          disabled={
                            row.status === "saved" ||
                            row.status === "committing" ||
                            row.status === "scanning"
                          }
                          onChange={(event) => {
                            const v = event.target.value;
                            patchRow(row.key, { productId: v === "__auto_create__" ? "" : v, message: v === "__auto_create__" ? "سيتم إنشاء منتج جديد تلقائياً عند الاعتماد." : row.message });
                          }}
                          className="w-full min-w-[230px] rounded-lg border border-slate-300 bg-white px-2 py-1.5"
                        >
                          <option value="">— اختر المنتج يدوياً —</option>
                          <option value="__auto_create__">+ إنشاء منتج جديد تلقائياً</option>
                          {catalog.map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.brand_arabic} — {product.name_arabic}
                            </option>
                          ))}
                        </select>
                        {selectedProduct && (
                          <p className="mt-1 text-[11px] text-emerald-700">
                            {selectedProduct.verification_status === "verified"
                              ? "منتج موثّق مسبقاً — ستُستبدل الصورة الأساسية"
                              : "سيتم توثيق المنتج الآن"}
                          </p>
                        )}
                        {row.match?.candidates &&
                          row.match.candidates.length > 1 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {row.match.candidates
                                .filter(
                                  (candidate) =>
                                    candidate.productId !== row.productId,
                                )
                                .slice(0, 2)
                                .map((candidate) => (
                                  <button
                                    key={candidate.productId}
                                    type="button"
                                    onClick={() =>
                                      patchRow(row.key, {
                                        productId: candidate.productId,
                                      })
                                    }
                                    className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 transition hover:bg-slate-200"
                                    title={`بديل بثقة ${Math.round(
                                      candidate.score * 100,
                                    )}%`}
                                  >
                                    {candidate.brand_arabic} —{" "}
                                    {candidate.name_arabic}
                                  </button>
                                ))}
                            </div>
                          )}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${confidenceClasses(
                            row.match?.confidence ?? null,
                          )}`}
                        >
                          {confidenceLabel(row.match?.confidence ?? null)}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                          <input
                            type="checkbox"
                            checked={row.autoCutout}
                            disabled={
                              row.status === "saved" ||
                              row.status === "committing"
                            }
                            onChange={(event) =>
                              patchRow(row.key, {
                                autoCutout: event.target.checked,
                              })
                            }
                            className="h-4 w-4"
                          />
                          BRIA RMBG
                        </label>
                      </td>
                      <td className="max-w-[220px] px-3 py-2 text-xs">
                        {row.status === "saved" ? (
                          <span className="font-bold text-emerald-700">
                            تم الاعتماد ✓
                          </span>
                        ) : row.status === "error" ? (
                          <span className="font-bold text-red-700">خطأ</span>
                        ) : row.status === "scanning" ? (
                          <span className="text-slate-500">جارٍ القراءة…</span>
                        ) : row.status === "committing" ? (
                          <span className="text-slate-500">جارٍ الحفظ…</span>
                        ) : (
                          <span className="text-slate-500">جاهز</span>
                        )}
                        {row.message && (
                          <p className="mt-1 text-[11px] text-slate-500">
                            {row.message}
                          </p>
                        )}
                        {row.note && (
                          <p className="mt-1 text-[11px] text-amber-700">
                            {row.note}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-left">
                        <button
                          type="button"
                          onClick={() => removeRow(row.key)}
                          disabled={
                            row.status === "committing" ||
                            row.status === "scanning"
                          }
                          className="text-xs font-bold text-slate-400 transition hover:text-red-600 disabled:opacity-40"
                        >
                          حذف
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void commitAll()}
              disabled={busy || readyCount === 0}
              className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-black text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy
                ? "جارٍ الاعتماد…"
                : `✅ اعتماد وحفظ الكل في قاعدة البيانات (${readyCount})`}
            </button>
            <button
              type="button"
              onClick={clearRows}
              disabled={busy}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold transition hover:bg-slate-50 disabled:opacity-50"
            >
              مسح القائمة
            </button>
            {batchMessage && (
              <span className="text-sm font-semibold text-emerald-700">
                {batchMessage}
              </span>
            )}
            {batchError && (
              <span className="text-sm font-semibold text-red-700">
                {batchError}
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
