"use client";

import { useState, type FormEvent } from "react";
import { adminWriteHeaders } from "@/lib/al-rahma/admin-key";

type Props = {
  onClose: () => void;
  onSaved: (message: string) => void;
};

const SAMPLE = `[
  {
    "product_id": "ضع معرف المنتج هنا",
    "source_name": "الموقع الرسمي للبراند",
    "source_url": "https://example.com/product",
    "source_type": "manufacturer",
    "image_url": "https://example.com/packshot.jpg",
    "verified_claims": [
      { "claim_type": "benefit", "claim_text": "فائدة منقولة كما هي من المصدر" }
    ],
    "warehouse_stock_status": "in_stock"
  }
]`;

function parseRecords(value: string): unknown[] {
  const parsed: unknown = JSON.parse(value);
  if (Array.isArray(parsed)) return parsed;
  if (
    parsed &&
    typeof parsed === "object" &&
    Array.isArray((parsed as { records?: unknown }).records)
  ) {
    return (parsed as { records: unknown[] }).records;
  }
  throw new Error("الصيغة يجب أن تكون مصفوفة JSON أو كائن يحتوي على records.");
}

export default function BulkImportModal({ onClose, onSaved }: Props) {
  const [json, setJson] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult("");

    let records: unknown[];
    try {
      records = parseRecords(json);
    } catch (parseError) {
      setError(
        parseError instanceof Error
          ? parseError.message
          : "تعذر قراءة JSON.",
      );
      return;
    }

    if (records.length === 0 || records.length > 50) {
      setError("أرسل من 1 إلى 50 سجل في الدفعة الواحدة.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/db/research/bulk-ingest", {
        method: "POST",
        headers: adminWriteHeaders({
          Accept: "application/json",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ records }),
      });
      const body = (await response.json()) as {
        success?: boolean;
        error?: string;
        detail?: string;
        total?: number;
        processed?: number;
        failed?: number;
        category?: string | null;
        missing?: string[];
        categories?: string[];
        results?: { product_id: string; ok: boolean; error?: string }[];
      };

      if (!response.ok || !body.success) {
        const failedRows = (body.results ?? [])
          .filter((row) => !row.ok)
          .map((row) => `${row.product_id}: ${row.error ?? "فشل"}`);

        throw new Error(
          response.status === 401
            ? "المفتاح الإداري مطلوب أو غير صحيح. أدخله من أعلى لوحة التحكم."
            : body.detail ||
                body.error ||
                (body.missing?.length
                  ? `منتجات غير موجودة: ${body.missing.join("، ")}`
                  : "") ||
                (body.categories?.length
                  ? `الدفعة تحتوي تصنيفات مختلفة: ${body.categories.join("، ")}`
                  : "") ||
                failedRows.join(" · ") ||
                `تعذر الاستيراد الجماعي (${response.status})`,
        );
      }

      const previewNote =
        response.headers.get("X-Auth-Mode") === "unconfigured-preview"
          ? " · وضع المعاينة: لم يُربط مفتاح الإدارة بعد."
          : "";
      const message =
        `تم استيراد ${body.processed ?? records.length} من ${body.total ?? records.length} سجل` +
        `${body.category ? ` · التصنيف: ${body.category}` : ""}${previewNote}`;
      setResult(message);
      onSaved(message);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "تعذر الاستيراد الجماعي.",
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
      aria-labelledby="bulk-import-title"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/60 p-4"
    >
      <div className="my-6 w-full max-w-3xl rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-1 flex items-start justify-between gap-3">
          <h3 id="bulk-import-title" className="text-lg font-black">
            استيراد جماعي (Bulk JSON)
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-3 py-1 text-sm font-bold"
          >
            إغلاق
          </button>
        </div>
        <p className="mb-3 text-sm text-slate-500">
          الصق مصفوفة JSON من 1 إلى 50 سجل بنفس حقول التوثيق الفردي. كل المنتجات
          في الدفعة يجب أن تكون من نفس التصنيف، وتُعالج الدفعة مرة واحدة دون
          تكرار للبيانات الموجودة.
        </p>

        <form onSubmit={submit} className="space-y-3 text-sm">
          <label className="block font-semibold text-slate-700">
            محتوى JSON
            <textarea
              required
              value={json}
              onChange={(event) => setJson(event.target.value)}
              rows={14}
              spellCheck={false}
              placeholder={SAMPLE}
              dir="ltr"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs font-normal"
            />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setJson(SAMPLE)}
              className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-bold text-slate-700"
            >
              إدراج نموذج فارغ
            </button>
            <span className="text-xs text-slate-500">
              الحد الأقصى 50 سجل في الطلب الواحد.
            </span>
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">
              {error}
            </p>
          )}
          {result && (
            <p
              role="status"
              className="rounded-lg bg-emerald-50 p-3 text-emerald-900"
            >
              {result}
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
              {saving ? "جاري الاستيراد..." : "استيراد الدفعة"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
