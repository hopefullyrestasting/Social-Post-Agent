"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import IDMark from "@/components/idesign/id-mark";
import LanguageSwitcher from "@/components/idesign/language-switcher";
import {
  accessKeyHeaders,
  installAccessKeyFetch,
  persistAccessKey,
  readAccessKey,
} from "@/lib/al-rahma/access-key";
import { IDESIGN_STUDIO_CONFIG } from "@/lib/al-rahma/brand-core";
import { downloadCreativesZip, type ExportCreative } from "@/lib/al-rahma/export";
import {
  languageDirection,
  translate,
  type LanguageCode,
  type TranslationKey,
} from "@/lib/al-rahma/i18n";

type Product = {
  id: string;
  name_arabic: string;
  name_english: string | null;
  category: string | null;
  image_url: string | null;
  sales_line: string | null;
  offer_text: string | null;
  price: number | null;
  last_advertised_at: number | null;
  verification_status: string;
};

type ApiFailure = {
  success: false;
  error?: string;
  detail?: string;
  code?: string;
  productIds?: string[];
};

type TenantBrandProfile = {
  brandName?: string;
  industry?: string;
  logoUrl?: string | null;
  contactInfo?: string | Record<string, unknown> | null;
};

type TenantInfo = {
  id?: string;
  label?: string;
  status?: string;
  days_remaining?: number | null;
  brand_locked?: boolean;
  brand?: TenantBrandProfile | null;
  subscription?: { days_remaining?: number | null; unlimited_generation?: boolean };
};

type BrandSetupForm = {
  brand_name: string;
  industry: string;
  logo_url: string;
  contact_info: string;
};

type CampaignCreative = ExportCreative & {
  success?: boolean;
  variant_number?: number | null;
};

type CampaignResult = {
  creatives?: CampaignCreative[];
  selected_product_ids?: string[];
  message?: string;
};

type ProductPatch = {
  name_arabic?: string;
  price?: number | null;
  sales_line?: string;
  offer_text?: string | null;
};

const DEFAULT_COUNT = 5;
const MAX_COUNT = 100;

/** localStorage is an external store; useSyncExternalStore avoids effect-driven setState. */
const subscribeToAccessKey = () => () => {};
const serverAccessKey = () => "";

async function readJson<T>(response: Response): Promise<T & { success?: boolean }> {
  return (await response.json()) as T & { success?: boolean };
}

function failureMessage(body: ApiFailure, status: number, fallback: string): string {
  if (body.code === "already_generated") {
    return `${fallback}: ${(body.productIds ?? []).length}`;
  }
  return body.detail || body.error || `${fallback} (${status})`;
}

function maskAccessKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return "—";
  if (trimmed.length <= 8) return "arh_••••";
  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`;
}

async function fetchTenant(signal?: AbortSignal): Promise<TenantInfo | null> {
  installAccessKeyFetch();
  const response = await fetch("/api/tenant/me", {
    headers: { Accept: "application/json", ...accessKeyHeaders() },
    cache: "no-store",
    signal,
  });
  const body = await readJson<{ tenant?: TenantInfo }>(response);
  if (!response.ok || body.success === false) {
    const failed = body as ApiFailure;
    if (failed.code === "access_key_required") return null;
    throw new Error(failureMessage(failed, response.status, "Unable to read the access key status."));
  }
  return body.tenant ?? null;
}

async function fetchProducts(signal?: AbortSignal, fallback = ""): Promise<Product[]> {
  installAccessKeyFetch();
  const response = await fetch("/api/db/products?limit=100", {
    headers: { Accept: "application/json", ...accessKeyHeaders() },
    cache: "no-store",
    signal,
  });
  const body = await readJson<{ products?: Product[] }>(response);
  if (!response.ok || body.success === false) {
    throw new Error(
      failureMessage(body as ApiFailure, response.status, fallback),
    );
  }
  return Array.isArray(body.products) ? body.products : [];
}

export default function DashboardPage() {
  const [language, setLanguage] = useState<LanguageCode>("ar");
  const direction = languageDirection(language);
  const text = (key: TranslationKey) => translate(language, key);

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [customCount, setCustomCount] = useState(DEFAULT_COUNT);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const storedKey = useSyncExternalStore(subscribeToAccessKey, readAccessKey, serverAccessKey);
  const [manualKey, setManualKey] = useState<string | null>(null);
  const activeKey = manualKey ?? storedKey;
  const accessKeyInput = manualKey ?? storedKey;
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [tenantError, setTenantError] = useState("");
  const [checkingKey, setCheckingKey] = useState(true);
  const [brandForm, setBrandForm] = useState<BrandSetupForm>({
    brand_name: "",
    industry: "",
    logo_url: "",
    contact_info: "",
  });
  const [lockingBrand, setLockingBrand] = useState(false);
  const [brandError, setBrandError] = useState("");

  useEffect(() => {
    installAccessKeyFetch();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchTenant(controller.signal)
      .then((info) => {
        if (controller.signal.aborted) return;
        setTenant(info);
        setTenantError(info ? "" : storedKey ? translate(language, "accessKeyInvalid") : "");
        if (info?.brand) {
          setBrandForm((previous) => ({
            ...previous,
            brand_name: previous.brand_name || info.brand?.brandName || "",
            industry: previous.industry || info.brand?.industry || "",
          }));
        }
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          setTenant(null);
          setTenantError(caught instanceof Error ? caught.message : translate(language, "accessKeyInvalid"));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setCheckingKey(false);
      });
    return () => controller.abort();
  }, [refreshKey, language, storedKey]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = direction;
  }, [language, direction]);

  useEffect(() => {
    const controller = new AbortController();
    const saveFailed = translate(language, "saveFailed");
    fetchProducts(controller.signal, saveFailed)
      .then((items) => {
        if (controller.signal.aborted) return;
        setProducts(items);
        const generatedIds = new Set(
          items.filter((item) => item.last_advertised_at).map((item) => item.id),
        );
        setSelected((previous) => previous.filter((id) => !generatedIds.has(id)));
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          setLoadError(caught instanceof Error ? caught.message : saveFailed);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [refreshKey, language]);

  const remaining = products.filter((product) => !product.last_advertised_at);
  const generated = products.filter((product) => Boolean(product.last_advertised_at));
  const needsBrandSetup = Boolean(tenant && tenant.brand_locked !== true);

  async function applyAccessKey() {
    installAccessKeyFetch();
    const key = accessKeyInput.trim();
    if (!key) {
      persistAccessKey("");
      setManualKey("");
      setTenant(null);
      setError(text("keyRequired"));
      return;
    }
    persistAccessKey(key);
    setManualKey(key);
    setTenantError("");
    setCheckingKey(true);
    setError("");
    setNotice(text("accessKeySaved"));
    setLoading(true);
    setRefreshKey((value) => value + 1);
  }

  async function lockBrand() {
    installAccessKeyFetch();
    const brandName = brandForm.brand_name.trim();
    const industry = brandForm.industry.trim();
    if (!brandName || !industry) {
      setBrandError(`${text("brandName")} · ${text("industry")}`);
      return;
    }
    setBrandError("");
    setLockingBrand(true);
    try {
      const response = await fetch("/api/tenant/lock-brand", {
        method: "POST",
        headers: accessKeyHeaders({
          "Content-Type": "application/json",
          Accept: "application/json",
        }),
        body: JSON.stringify({
          brand_name: brandName,
          industry,
          logo_url: brandForm.logo_url.trim() || null,
          contact_info: brandForm.contact_info.trim() || null,
          locale: language === "ar" ? "ar-EG" : language,
          rtl: direction === "rtl",
        }),
      });
      const body = await readJson<{ tenant?: TenantInfo }>(response);
      if (!response.ok || body.success === false) {
        throw new Error(failureMessage(body as ApiFailure, response.status, text("saveFailed")));
      }
      setTenant(body.tenant ?? null);
      setNotice(text("brandLocked"));
      setRefreshKey((value) => value + 1);
    } catch (caught) {
      setBrandError(caught instanceof Error ? caught.message : text("saveFailed"));
    } finally {
      setLockingBrand(false);
    }
  }

  async function uploadImages(files: FileList | File[]) {
    const list = Array.from(files ?? []).filter((file) => file.type.startsWith("image/"));
    if (list.length === 0) return;
    installAccessKeyFetch();
    setUploading(true);
    setError("");
    let added = 0;
    let failed = 0;
    let lastSalesLine = "";
    for (const file of list) {
      const form = new FormData();
      form.append("imageFile", file);
      form.append("autoCreate", "true");
      form.append("autoCutout", "true");
      try {
        const response = await fetch("/api/assets/upload", {
          method: "POST",
          headers: accessKeyHeaders({ Accept: "application/json" }),
          body: form,
        });
        const body = await readJson<{ salesLine?: string | null }>(response);
        if (!response.ok || body.success === false) {
          const failedBody = body as ApiFailure;
          throw new Error(
            failureMessage(failedBody, response.status, text("uploadFailed")),
          );
        }
        added += 1;
        if (typeof body.salesLine === "string") lastSalesLine = body.salesLine;
      } catch (caught) {
        failed += 1;
        setError(caught instanceof Error ? caught.message : text("uploadFailed"));
      }
    }
    setUploading(false);
    setNotice(
      `${text("uploadDone")} ${added}${lastSalesLine ? ` · ${text("salesLine")}: ${lastSalesLine}` : ""}${
        failed ? ` · ${text("uploadFailed")} ${failed}` : ""
      }`,
    );
    setLoading(true);
    setLoadError("");
    setRefreshKey((value) => value + 1);
  }

  async function saveProductField(product: Product, patch: ProductPatch) {
    installAccessKeyFetch();
    setError("");
    try {
      const response = await fetch(
        `/api/db/products?id=${encodeURIComponent(product.id)}`,
        {
          method: "PATCH",
          headers: accessKeyHeaders({
            "Content-Type": "application/json",
            Accept: "application/json",
          }),
          body: JSON.stringify(patch),
        },
      );
      const body = await readJson(response);
      if (!response.ok || body.success === false) {
        const failed = body as ApiFailure;
        throw new Error(failureMessage(failed, response.status, text("saveFailed")));
      }
      setNotice(text("saved"));
      setProducts((previous) =>
        previous.map((item) => (item.id === product.id ? { ...item, ...patch } : item)),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : text("saveFailed"));
    }
  }

  async function generateAndDownload(body: Record<string, unknown>) {
    installAccessKeyFetch();
    setGenerating(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/db/campaigns/run", {
        method: "POST",
        headers: accessKeyHeaders({
          "Content-Type": "application/json",
          Accept: "application/json",
        }),
        body: JSON.stringify(body),
        cache: "no-store",
      });
      const result = await readJson<CampaignResult>(response);
      if (!response.ok || result.success === false) {
        const failed = result as ApiFailure;
        if (failed.code === "already_generated") {
          setSelected([]);
          setLoading(true);
          setRefreshKey((value) => value + 1);
        }
        throw new Error(failureMessage(failed, response.status, text("saveFailed")));
      }
      const creatives = Array.isArray(result.creatives) ? result.creatives : [];
      if (creatives.length > 0) {
        await downloadCreativesZip(
          creatives,
          `${IDESIGN_STUDIO_CONFIG.exportSlug}-${Date.now()}.zip`,
        );
      }
      setNotice(result.message || `${text("generationDone")} ${creatives.length}`);
      setSelected([]);
      setLoading(true);
      setRefreshKey((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : text("saveFailed"));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <main dir={direction} className="min-h-screen bg-white text-slate-900">
      <header className="border-b border-blue-100 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <Link href="/" className="flex items-center gap-3" aria-label={IDESIGN_STUDIO_CONFIG.name}>
            <IDMark />
            <span className="leading-tight">
              <span className="block text-lg font-black text-[#1D4ED8]">
                {IDESIGN_STUDIO_CONFIG.name} · {IDESIGN_STUDIO_CONFIG.productName}
              </span>
              <span className="block text-xs font-semibold text-slate-500" dir="ltr">
                {IDESIGN_STUDIO_CONFIG.tagline} · {IDESIGN_STUDIO_CONFIG.websiteLabel}
              </span>
            </span>
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <LanguageSwitcher
              language={language}
              onChange={setLanguage}
              label={text("language")}
              dir={direction}
            />
            <Link
              href="/"
              className="rounded-lg border border-blue-200 px-3 py-2 text-sm font-bold text-[#1D4ED8] transition hover:bg-blue-50"
            >
              {text("home")}
            </Link>
            <a
              href={IDESIGN_STUDIO_CONFIG.whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-[#2563EB] px-3 py-2 text-sm font-bold text-white transition hover:bg-[#1D4ED8]"
            >
              {text("support")}
            </a>
          </div>
        </div>
      </header>

      <section className="border-b border-blue-100 bg-blue-50/70" aria-label={text("accessKey")}>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-5 py-3">
          <label htmlFor="dashboard-access-key" className="shrink-0 text-sm font-extrabold text-[#1D4ED8]">
            {text("accessKey")}
          </label>
          <input
            id="dashboard-access-key"
            dir="ltr"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={accessKeyInput}
            placeholder={text("accessKeyPlaceholder")}
            onChange={(event) => setManualKey(event.target.value)}
            className="min-w-[220px] flex-1 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => void applyAccessKey()}
            className="rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#1D4ED8]"
          >
            {text("applyKey")}
          </button>
          <p className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-slate-600">
            <span dir="ltr">
              {text("keyStatus")}: {checkingKey ? "…" : maskAccessKey(activeKey)}
            </span>
            <span>
              {text("brandStatus")}: {tenant?.brand?.brandName || (tenant ? text("brandSetupRequired") : "—")}
            </span>
            <span>
              {text("remainingCount")}: {remaining.length} · {text("generatedCount")}: {generated.length}
            </span>
          </p>
        </div>
        {tenantError ? (
          <p role="alert" className="mx-auto max-w-6xl px-5 pb-3 text-xs font-semibold text-red-700">
            {tenantError}
          </p>
        ) : null}
      </section>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-7 sm:px-5">
        <section className="rounded-2xl border border-blue-100 bg-gradient-to-br from-white to-blue-50 p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black text-slate-900">{text("title")}</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">{text("subtitle")}</p>
              <p className="mt-2 text-xs text-slate-500">{text("downloadHint")}</p>
            </div>
            <div className="rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm">
              <p className="mb-1 font-bold text-[#1D4ED8]">{text("contact")}</p>
              <a href={IDESIGN_STUDIO_CONFIG.websiteUrl} className="block text-blue-700 underline" dir="ltr">
                {IDESIGN_STUDIO_CONFIG.websiteLabel}
              </a>
              <a href={IDESIGN_STUDIO_CONFIG.emailUrl} className="mt-1 block text-blue-700 underline" dir="ltr">
                {IDESIGN_STUDIO_CONFIG.email}
              </a>
              <a href={IDESIGN_STUDIO_CONFIG.whatsappUrl} className="mt-1 block text-blue-700 underline" dir="ltr">
                {IDESIGN_STUDIO_CONFIG.phoneLabel}
              </a>
            </div>
          </div>
          <label className="mt-5 block cursor-pointer rounded-2xl border-2 border-dashed border-blue-300 bg-white p-6 text-center transition hover:border-[#1D4ED8]">
            <span className="block text-base font-extrabold text-[#1D4ED8]">
              {uploading ? text("uploading") : text("upload")}
            </span>
            <span className="mt-1 block text-sm text-slate-500">{text("uploadHint")}</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="mt-4 block w-full text-sm"
              onChange={(event) => {
                void uploadImages(event.currentTarget.files ?? []);
                event.currentTarget.value = "";
              }}
            />
          </label>
        </section>

        {needsBrandSetup ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5 shadow-sm">
            <div className="mb-4">
              <h2 className="text-lg font-black text-[#1D4ED8]">{text("brandSetupTitle")}</h2>
              <p className="mt-1 text-sm text-slate-700">{text("brandSetupHint")}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold">
                {text("brandName")}
                <input
                  dir="auto"
                  value={brandForm.brand_name}
                  onChange={(event) =>
                    setBrandForm((previous) => ({ ...previous, brand_name: event.target.value }))
                  }
                  className="mt-1 w-full rounded-lg border border-blue-200 bg-white px-3 py-2"
                />
              </label>
              <label className="text-sm font-semibold">
                {text("industry")}
                <input
                  dir="auto"
                  value={brandForm.industry}
                  onChange={(event) =>
                    setBrandForm((previous) => ({ ...previous, industry: event.target.value }))
                  }
                  className="mt-1 w-full rounded-lg border border-blue-200 bg-white px-3 py-2"
                />
              </label>
              <label className="text-sm font-semibold sm:col-span-2">
                {text("logoUrl")}
                <input
                  dir="ltr"
                  type="url"
                  value={brandForm.logo_url}
                  onChange={(event) =>
                    setBrandForm((previous) => ({ ...previous, logo_url: event.target.value }))
                  }
                  className="mt-1 w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm"
                />
              </label>
              <label className="text-sm font-semibold sm:col-span-2">
                {text("contactInfo")}
                <input
                  dir="auto"
                  value={brandForm.contact_info}
                  onChange={(event) =>
                    setBrandForm((previous) => ({ ...previous, contact_info: event.target.value }))
                  }
                  className="mt-1 w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm"
                />
              </label>
            </div>
            {brandError ? (
              <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {brandError}
              </p>
            ) : null}
            <button
              type="button"
              disabled={lockingBrand}
              onClick={() => void lockBrand()}
              className="mt-4 rounded-lg bg-[#1D4ED8] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#1E40AF] disabled:opacity-50"
            >
              {lockingBrand ? text("lockingBrand") : text("lockBrand")}
            </button>
          </section>
        ) : null}

        <section className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black">{text("products")}</h2>
              <p className="text-sm text-slate-500">{text("productsHint")}</p>
              <p className="mt-1 text-xs font-semibold text-[#1D4ED8]">
                {text("remainingCount")}: {remaining.length} · {text("generatedCount")}: {generated.length}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-sm font-semibold">
                {text("count")}
                <input
                  type="number"
                  min={1}
                  max={MAX_COUNT}
                  value={customCount}
                  onChange={(event) =>
                    setCustomCount(
                      Math.max(1, Math.min(MAX_COUNT, Number(event.target.value) || 1)),
                    )
                  }
                  className="w-20 rounded-lg border border-blue-200 px-2 py-1"
                />
              </label>
              <button
                type="button"
                disabled={generating}
                onClick={() => void generateAndDownload({ mode: "basic", count: customCount })}
                className="rounded-lg bg-[#1D4ED8] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#1E40AF] disabled:opacity-50"
              >
                {generating ? text("generating") : text("generateNext")}
              </button>
              <button
                type="button"
                disabled={generating || selected.length === 0}
                onClick={() => void generateAndDownload({ mode: "basic", productIds: selected })}
                className="rounded-lg border border-[#1D4ED8] px-4 py-2 text-sm font-bold text-[#1D4ED8] transition hover:bg-blue-50 disabled:opacity-50"
              >
                {text("generateSelected")} ({selected.length})
              </button>
            </div>
          </div>

          {notice ? (
            <p role="status" className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
              {notice}
            </p>
          ) : null}
          {error || loadError ? (
            <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {error || loadError}
            </p>
          ) : null}

          {loading ? (
            <p className="py-8 text-center text-slate-500">…</p>
          ) : products.length === 0 ? (
            <p className="rounded-xl bg-blue-50 p-6 text-center text-sm text-slate-600">{text("empty")}</p>
          ) : (
            <div className="space-y-3">
              {products.map((product) => {
                const generatedAt = product.last_advertised_at
                  ? new Date(product.last_advertised_at).toLocaleDateString(language)
                  : "";
                const isGenerated = Boolean(product.last_advertised_at);
                return (
                  <article
                    key={product.id}
                    className={`rounded-xl border p-4 ${
                      isGenerated ? "border-slate-200 bg-slate-50" : "border-blue-200 bg-white"
                    }`}
                  >
                    <div className="flex flex-wrap items-start gap-3">
                      <input
                        type="checkbox"
                        aria-label={`${text("selectProducts")}: ${product.name_arabic}`}
                        disabled={isGenerated}
                        checked={selected.includes(product.id)}
                        onChange={(event) =>
                          setSelected((previous) =>
                            event.target.checked
                              ? [...previous, product.id]
                              : previous.filter((id) => id !== product.id),
                          )
                        }
                        className="mt-2 h-4 w-4 accent-[#1D4ED8]"
                      />
                      {product.image_url ? (
                        <Image
                          src={product.image_url}
                          alt={product.name_arabic}
                          width={64}
                          height={64}
                          unoptimized
                          className="h-16 w-16 rounded-lg border border-blue-100 object-contain"
                        />
                      ) : (
                        <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-blue-50 text-xs text-blue-400">
                          —
                        </div>
                      )}
                      <div className="min-w-[220px] flex-1 space-y-2">
                        <input
                          aria-label={`${text("productName")}: ${product.name_arabic}`}
                          defaultValue={product.name_arabic}
                          onBlur={(event) => {
                            const value = event.target.value.trim();
                            if (value && value !== product.name_arabic) {
                              void saveProductField(product, { name_arabic: value });
                            }
                          }}
                          className="w-full rounded-lg border border-blue-200 px-3 py-2 font-bold"
                        />
                        <input
                          aria-label={`${text("salesLine")}: ${product.name_arabic}`}
                          defaultValue={product.sales_line ?? ""}
                          placeholder={text("salesLine")}
                          onBlur={(event) => {
                            const value = event.target.value.trim();
                            if (value !== (product.sales_line ?? "")) {
                              void saveProductField(product, { sales_line: value });
                            }
                          }}
                          className="w-full rounded-lg border border-blue-200 px-3 py-1.5 text-sm"
                        />
                        <div className="flex flex-wrap gap-2">
                          <input
                            aria-label={`${text("price")}: ${product.name_arabic}`}
                            type="number"
                            min={0}
                            defaultValue={product.price ?? ""}
                            placeholder={text("pricePlaceholder")}
                            onBlur={(event) => {
                              const value = event.target.value;
                              const nextPrice = value === "" ? null : Number(value);
                              if (nextPrice !== product.price) {
                                void saveProductField(product, { price: nextPrice });
                              }
                            }}
                            className="w-32 rounded-lg border border-blue-200 px-3 py-1.5 text-sm"
                          />
                          <input
                            aria-label={`${text("offer")}: ${product.name_arabic}`}
                            defaultValue={product.offer_text ?? ""}
                            placeholder={text("offerPlaceholder")}
                            onBlur={(event) => {
                              const value = event.target.value.trim() || null;
                              if (value !== (product.offer_text ?? null)) {
                                void saveProductField(product, { offer_text: value });
                              }
                            }}
                            className="min-w-[200px] flex-1 rounded-lg border border-blue-200 px-3 py-1.5 text-sm"
                          />
                        </div>
                        <p className={`text-xs font-bold ${isGenerated ? "text-slate-500" : "text-[#1D4ED8]"}`}>
                          {isGenerated
                            ? `${text("generated")}: ${generatedAt}`
                            : text("remaining")}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={generating || isGenerated}
                        onClick={() =>
                          void generateAndDownload({ mode: "basic", productIds: [product.id] })
                        }
                        className="rounded-lg bg-[#2563EB] px-3 py-2 text-sm font-bold text-white transition hover:bg-[#1D4ED8] disabled:opacity-50"
                      >
                        {text("generateOne")}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          <p className="mt-4 text-xs text-slate-500">{text("queueHint")}</p>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-blue-100 py-6 text-xs text-slate-500">
          <p className="flex items-center gap-2">
            <IDMark small /> {IDESIGN_STUDIO_CONFIG.productName} {IDESIGN_STUDIO_CONFIG.tagline}
          </p>
          <p className="flex flex-wrap gap-3">
            <a href={IDESIGN_STUDIO_CONFIG.websiteUrl} className="text-blue-700 underline" dir="ltr">
              {IDESIGN_STUDIO_CONFIG.websiteLabel}
            </a>
            <a href={IDESIGN_STUDIO_CONFIG.emailUrl} className="text-blue-700 underline" dir="ltr">
              {IDESIGN_STUDIO_CONFIG.email}
            </a>
            <a href={IDESIGN_STUDIO_CONFIG.whatsappUrl} className="text-blue-700 underline" dir="ltr">
              {IDESIGN_STUDIO_CONFIG.phoneLabel}
            </a>
          </p>
        </footer>
      </div>
    </main>
  );
}
