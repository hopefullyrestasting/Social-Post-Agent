"use client";

import { useState, type FormEvent } from "react";

type Props = {
  product: { id: string; name_arabic: string };
  onClose: () => void;
  onSaved: (message: string) => void;
};

type ClaimType = "benefit" | "usage";

function parseClaims(value: string, claimType: ClaimType) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((claim_text) => ({ claim_type: claimType, claim_text }));
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export default function VerifyModal({ product, onClose, onSaved }: Props) {
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceType, setSourceType] = useState<
    "manufacturer" | "regulator" | "retailer" | "other"
  >("manufacturer");
  const [imageUrl, setImageUrl] = useState("");
  const [stockStatus, setStockStatus] = useState<
    "" | "in_stock" | "out_of_stock" | "unknown"
  >("");
  const [benefits, setBenefits] = useState("");
  const [usage, setUsage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!sourceName.trim()) {
      setError("اسم المصدر مطلوب.");
      return;
    }
    if (!isHttpUrl(sourceUrl.trim())) {
      setError("رابط المصدر يجب أن يكون رابط http(s) صالح.");
      return;
    }
    if (!isHttpUrl(imageUrl.trim())) {
      setError("رابط الصورة الأصلية يجب أن يكون رابط http(s) صالح.");
      return;
    }

    const verifiedClaims = [
      ...parseClaims(benefits, "benefit"),
      ...parseClaims(usage, "usage"),
    ];

    if (verifiedClaims.length === 0) {
      setError(
        "أضف فائدة أو طريقة استخدام واحدة على الأقل تم التحقق منها من المصدر.",
      );
      return;
    }

    const payload: Record<string, unknown> = {
      product_id: product.id,
      source_name: sourceName.trim(),
      source_url: sourceUrl.trim(),
      source_type: sourceType,
      image_url: imageUrl.trim(),
      verified_claims: verifiedClaims,
    };
    if (stockStatus) payload.warehouse_stock_status = stockStatus;

    setSaving(true);
    try {
      const response = await fetch("/api/db/research/ingest", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as {
        success?: boolean;
        error?: string;
        detail?: string;
        claims?: { inserted: number; skipped: number };
      };

      if (!response.ok || !body.success) {
        throw new Error(
          body.detail || body.error || `تعذر حفظ التوثيق (${response.status})`,
        );
      }

      onSaved(
        `تم توثيق ${product.name_arabic}: ${body.claims?.inserted ?? 0} ادعاء جديد، ` +
          `${body.claims?.skipped ?? 0} مكرر تم تجاهله.`,
      );
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "تعذر حفظ التوثيق.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="verify-modal-title"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/60 p-4"
    >
      <div className="my-6 w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-1 flex items-start justify-between gap-3">
          <h3 id="verify-modal-title" className="text-lg font-black">
            إضافة صورة مرجعية وتوثيق المنتج
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-3 py-1 text-sm font-bold"
          >
            إغلاق
          </button>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          {product.name_arabic} · تُحفظ الصورة كما هي بدون أي تعديل على العبوة أو
          الشعار.
        </p>

        <form onSubmit={submit} className="space-y-3 text-sm">
          <label className="block font-semibold text-slate-700">
            اسم المصدر
            <input
              required
              value={sourceName}
              onChange={(event) => setSourceName(event.target.value)}
              placeholder="الموقع الرسمي للبراند / جهة رسمية"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal"
            />
          </label>

          <label className="block font-semibold text-slate-700">
            رابط المصدر
            <input
              required
              type="url"
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.target.value)}
              placeholder="https://..."
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal"
              dir="ltr"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block font-semibold text-slate-700">
              نوع المصدر
              <select
                value={sourceType}
                onChange={(event) =>
                  setSourceType(
                    event.target.value as
                      | "manufacturer"
                      | "regulator"
                      | "retailer"
                      | "other",
                  )
                }
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal"
              >
                <option value="manufacturer">الشركة المصنعة</option>
                <option value="regulator">جهة تنظيمية</option>
                <option value="retailer">تاجر تجزئة معتمد</option>
                <option value="other">أخرى</option>
              </select>
            </label>

            <label className="block font-semibold text-slate-700">
              حالة المخزون (اختياري)
              <select
                value={stockStatus}
                onChange={(event) =>
                  setStockStatus(
                    event.target.value as
                      | ""
                      | "in_stock"
                      | "out_of_stock"
                      | "unknown",
                  )
                }
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal"
              >
                <option value="">بدون تسجيل</option>
                <option value="in_stock">متوفر</option>
                <option value="out_of_stock">غير متوفر</option>
                <option value="unknown">غير معروف</option>
              </select>
            </label>
          </div>

          <label className="block font-semibold text-slate-700">
            رابط الصورة الأصلية (packshot)
            <input
              required
              type="url"
              value={imageUrl}
              onChange={(event) => setImageUrl(event.target.value)}
              placeholder="https://..."
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal"
              dir="ltr"
            />
          </label>

          <label className="block font-semibold text-slate-700">
            فوائد موثّقة (سطر لكل فائدة)
            <textarea
              value={benefits}
              onChange={(event) => setBenefits(event.target.value)}
              rows={3}
              placeholder="تُنقل كما هي من المصدر الموثّق"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal"
            />
          </label>

          <label className="block font-semibold text-slate-700">
            طريقة استخدام موثّقة (سطر لكل سطر)
            <textarea
              value={usage}
              onChange={(event) => setUsage(event.target.value)}
              rows={2}
              placeholder="اتركها فارغة إن لم تكن موثّقة"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal"
            />
          </label>

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 font-bold"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-emerald-600 px-5 py-2 font-bold text-white disabled:opacity-50"
            >
              {saving ? "جاري الحفظ..." : "حفظ والتوثيق"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
