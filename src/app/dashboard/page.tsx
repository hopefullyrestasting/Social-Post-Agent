"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import GeneratedCreativesGallery, {
  type GalleryCampaign,
  type GalleryCreative,
} from "@/components/idesign/generated-creatives-gallery";
import IDMark from "@/components/idesign/id-mark";
import StudioEmblem from "@/components/idesign/studio-emblem";
import LanguageSwitcher from "@/components/idesign/language-switcher";
import {
  accessKeyHeaders,
  installAccessKeyFetch,
  persistAccessKey,
  readAccessKey,
} from "@/lib/al-rahma/access-key";
import { IDESIGN_STUDIO_CONFIG } from "@/lib/al-rahma/brand-core";
import { downloadCreativePng, downloadCreativesZip, type ExportCreative } from "@/lib/al-rahma/export";
import {
  detectLanguage,
  languageFromLocale,
  languageDirection,
  persistLanguagePreference,
  readLanguagePreference,
  translate,
  type LanguageCode,
  type TranslationKey,
} from "@/lib/al-rahma/i18n";
import {
  isSupportedLogoMime,
  logoAcceptAttribute,
  prepareLogoFile,
  usableAssetUrl,
} from "@/lib/al-rahma/logo-upload";

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

type ApiFailure = { success: false; error?: string; detail?: string; code?: string; productIds?: string[] };
type TenantBrandProfile = { brandName?: string; industry?: string; logoUrl?: string | null; contactInfo?: string | Record<string, unknown> | null };
type ProvisionedBrandDefaults = { brand_name?: string | null; industry?: string | null; locale?: string | null; rtl?: boolean | null; support_contact?: string | null; logo_url?: string | null };
type TenantProvisioning = { copy_kind?: string | null; notes?: string | null; brand_defaults?: ProvisionedBrandDefaults | null };
type TenantGenerationInfo = { state?: "idle" | "running" | "cooldown"; busy?: boolean; in_flight_until?: number | null; in_flight_until_iso?: string | null; last_generation_at?: number | null; retry_after_seconds?: number };
type TenantInfo = { id?: string; label?: string; status?: string; days_remaining?: number | null; brand_locked?: boolean; brand?: TenantBrandProfile | null; provisioning?: TenantProvisioning | null; generation?: TenantGenerationInfo; subscription?: { days_remaining?: number | null; unlimited_generation?: boolean } };
type BrandSetupForm = { brand_name: string; industry: string; logo_url: string; contact_info: string };
type CampaignCreative = ExportCreative & { success?: boolean; variant_number?: number | null };
type CampaignResult = { creatives?: CampaignCreative[]; selected_product_ids?: string[]; message?: string; generation?: { state?: string; campaignId?: string; products?: number; creatives?: number } };
type CampaignApiCreative = { id: string; product_id: string; campaign_id?: string | null; variant_number?: number | null; image_url?: string | null; svg?: string | null; product_name_arabic?: string | null; brand_arabic?: string | null; headline_arabic?: string | null; copy_arabic?: string | null };
type CampaignApiRow = { id: string; campaign_date?: string | null; status?: string | null; total_images?: number | null; creatives?: CampaignApiCreative[] };
type GenerationPhase = "idle" | "preparing" | "running" | "complete" | "busy";
type GenerationProgress = { phase: GenerationPhase; detail?: string; retryAfterSeconds?: number };
type ProductPatch = { name_arabic?: string; price?: number | null; sales_line?: string; offer_text?: string | null };

const DEFAULT_COUNT = 5;
const MAX_COUNT = 100;
const subscribeToAccessKey = () => () => {};
const serverAccessKey = () => "";

async function readJson<T>(response: Response): Promise<T & { success?: boolean }> {
  return (await response.json()) as T & { success?: boolean };
}
function failureMessage(body: ApiFailure, status: number, fallback: string): string {
  if (body.code === "already_generated") return `${fallback}: ${(body.productIds ?? []).length}`;
  return body.detail || body.error || `${fallback} (${status})`;
}
function maskAccessKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return "—";
  if (trimmed.length <= 8) return "arh_••••";
  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`;
}
function currentTimestamp(): number {
  return Date.now();
}
async function fetchTenant(signal?: AbortSignal): Promise<TenantInfo | null> {
  installAccessKeyFetch();
  const response = await fetch("/api/tenant/me", { headers: { Accept: "application/json", ...accessKeyHeaders() }, cache: "no-store", signal });
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
  const response = await fetch("/api/db/products?limit=100", { headers: { Accept: "application/json", ...accessKeyHeaders() }, cache: "no-store", signal });
  const body = await readJson<{ products?: Product[] }>(response);
  if (!response.ok || body.success === false) throw new Error(failureMessage(body as ApiFailure, response.status, fallback));
  return Array.isArray(body.products) ? body.products : [];
}
async function fetchCampaigns(signal?: AbortSignal): Promise<GalleryCampaign[]> {
  installAccessKeyFetch();
  const response = await fetch("/api/db/campaigns?limit=20", { headers: { Accept: "application/json", ...accessKeyHeaders() }, cache: "no-store", signal });
  const body = await readJson<{ campaigns?: CampaignApiRow[] }>(response);
  if (!response.ok || body.success === false) throw new Error(failureMessage(body as ApiFailure, response.status, "Unable to load creatives."));
  return (body.campaigns ?? []).map((campaign) => ({ id: campaign.id, campaign_date: campaign.campaign_date ?? null, status: campaign.status ?? null, total_images: campaign.total_images ?? null, creatives: (campaign.creatives ?? []).map((creative): GalleryCreative => ({ id: creative.id, product_id: creative.product_id, campaign_id: creative.campaign_id ?? campaign.id, variant_number: creative.variant_number ?? null, image_url: creative.image_url ?? null, svg: creative.svg ?? null, product_name_arabic: creative.product_name_arabic ?? null, brand_arabic: creative.brand_arabic ?? null, headline_arabic: creative.headline_arabic ?? null, copy_arabic: creative.copy_arabic ?? null })) }));
}

export default function DashboardPage() {
  const [language, setLanguage] = useState<LanguageCode>("en");
  const appliedLocaleKey = useRef("");
  const hasExplicitLanguagePreference = useRef(false);
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
  const [campaigns, setCampaigns] = useState<GalleryCampaign[]>([]);
  const [loadedGalleryKey, setLoadedGalleryKey] = useState<number | null>(null);
  const [galleryErrorState, setGalleryErrorState] = useState<{ key: number; message: string } | null>(null);
  const galleryLoading = loadedGalleryKey !== refreshKey;
  const galleryError = galleryErrorState?.key === refreshKey ? galleryErrorState.message : "";
  const [progress, setProgress] = useState<GenerationProgress>({ phase: "idle" });
  const [retryBody, setRetryBody] = useState<Record<string, unknown> | null>(null);
  const storedKey = useSyncExternalStore(subscribeToAccessKey, readAccessKey, serverAccessKey);
  const [manualKey, setManualKey] = useState<string | null>(null);
  const [showKeyManager, setShowKeyManager] = useState(false);
  const [productDrawerOpen, setProductDrawerOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const activeKey = manualKey ?? storedKey;
  const accessKeyInput = manualKey ?? storedKey;
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [tenantError, setTenantError] = useState("");
  const [checkingKey, setCheckingKey] = useState(true);
  const [brandForm, setBrandForm] = useState<BrandSetupForm>({ brand_name: "", industry: "", logo_url: "", contact_info: "" });
  const [lockingBrand, setLockingBrand] = useState(false);
  const [brandError, setBrandError] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoPreview, setLogoPreview] = useState("");

  useEffect(() => { installAccessKeyFetch(); }, []);
  useEffect(() => {
    let active = true;
    const savedLanguage = readLanguagePreference();
    if (savedLanguage) { hasExplicitLanguagePreference.current = true; void Promise.resolve().then(() => { if (active) setLanguage(savedLanguage); }); return () => { active = false }; }
    void fetch("/api/locale").then(async (response) => { if (!response.ok) throw new Error("Unable to resolve visitor locale."); const result: unknown = await response.json(); if (active && !hasExplicitLanguagePreference.current && typeof result === "object" && result !== null && "language" in result && typeof result.language === "string") setLanguage(detectLanguage({ acceptLanguage: result.language })); }).catch(() => { if (active && !hasExplicitLanguagePreference.current) setLanguage(detectLanguage({ acceptLanguage: navigator.languages.join(",") })); });
    return () => { active = false };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetchTenant(controller.signal).then((info) => {
      if (controller.signal.aborted) return;
      setTenant(info);
      setTenantError(info ? "" : storedKey ? translate(language, "accessKeyInvalid") : "");
      const defaults = info?.provisioning?.brand_defaults;
      if (info?.id && appliedLocaleKey.current !== info.id) { appliedLocaleKey.current = info.id; const preferred = languageFromLocale(defaults?.locale); if (preferred && !hasExplicitLanguagePreference.current) setLanguage(preferred); }
      if (info?.generation?.busy && info.generation.state !== "idle") { const seconds = Math.max(1, info.generation.retry_after_seconds ?? 1); setProgress((previous) => previous.phase === "complete" ? previous : { phase: "busy", detail: `${translate(language, "generationBusy")} ${seconds} ${translate(language, "generationSeconds")}`, retryAfterSeconds: seconds }); }
      if (info?.brand) setBrandForm((previous) => ({ ...previous, brand_name: previous.brand_name || info.brand?.brandName || "", industry: previous.industry || info.brand?.industry || "", logo_url: previous.logo_url || info.brand?.logoUrl || "" }));
      else if (defaults) setBrandForm((previous) => ({ ...previous, brand_name: previous.brand_name || defaults.brand_name || "", industry: previous.industry || defaults.industry || "", logo_url: previous.logo_url || defaults.logo_url || "", contact_info: previous.contact_info || defaults.support_contact || "" }));
    }).catch((caught: unknown) => { if (!controller.signal.aborted) { setTenant(null); setTenantError(caught instanceof Error ? caught.message : translate(language, "accessKeyInvalid")); } }).finally(() => { if (!controller.signal.aborted) setCheckingKey(false); });
    return () => controller.abort();
  }, [refreshKey, language, storedKey]);
  useEffect(() => { document.documentElement.lang = language; document.documentElement.dir = direction; }, [language, direction]);
  const chooseLanguage = (code: LanguageCode) => { hasExplicitLanguagePreference.current = true; persistLanguagePreference(code); setLanguage(code); };
  useEffect(() => {
    const controller = new AbortController();
    const saveFailed = translate(language, "saveFailed");
    fetchProducts(controller.signal, saveFailed).then((items) => { if (controller.signal.aborted) return; setProducts(items); const generatedIds = new Set(items.filter((item) => item.last_advertised_at).map((item) => item.id)); setSelected((previous) => previous.filter((id) => !generatedIds.has(id))); }).catch((caught: unknown) => { if (!controller.signal.aborted) setLoadError(caught instanceof Error ? caught.message : saveFailed); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refreshKey, language]);
  useEffect(() => {
    const controller = new AbortController();
    fetchCampaigns(controller.signal).then((items) => { if (!controller.signal.aborted) setCampaigns(items); }).catch((caught: unknown) => { if (!controller.signal.aborted) setGalleryErrorState({ key: refreshKey, message: caught instanceof Error ? caught.message : translate(language, "galleryLoading") }); }).finally(() => { if (!controller.signal.aborted) setLoadedGalleryKey(refreshKey); });
    return () => controller.abort();
  }, [refreshKey, language]);

  const remaining = products.filter((product) => !product.last_advertised_at);
  const generated = products.filter((product) => Boolean(product.last_advertised_at));
  const needsBrandSetup = Boolean(tenant && tenant.brand_locked !== true);
  const workspaceReady = Boolean(tenant && tenant.brand_locked === true && activeKey);
  const topCreatives = campaigns.flatMap((campaign) => campaign.creatives).slice(0, 8);
  const selectedProduct = products.find((product) => product.id === selectedProductId) ?? null;

  async function applyAccessKey() {
    installAccessKeyFetch();
    const key = accessKeyInput.trim();
    if (!key) { persistAccessKey(""); setManualKey(""); setTenant(null); setShowKeyManager(false); setError(text("keyRequired")); return; }
    persistAccessKey(key); setManualKey(key); setTenantError(""); setCheckingKey(true); setError(""); setNotice(text("accessKeySaved")); setLoading(true); setRefreshKey((value) => value + 1);
  }
  async function lockBrand() {
    installAccessKeyFetch();
    const brandName = brandForm.brand_name.trim(); const industry = brandForm.industry.trim();
    if (!brandName || !industry) { setBrandError(`${text("brandName")} · ${text("industry")}`); return; }
    setBrandError(""); setLockingBrand(true);
    try {
      const response = await fetch("/api/tenant/lock-brand", { method: "POST", headers: accessKeyHeaders({ "Content-Type": "application/json", Accept: "application/json" }), body: JSON.stringify({ brand_name: brandName, industry, logo_url: brandForm.logo_url.trim() || null, contact_info: brandForm.contact_info.trim() || null, locale: tenant?.provisioning?.brand_defaults?.locale || (language === "ar" ? "ar-EG" : language), rtl: tenant?.provisioning?.brand_defaults?.rtl ?? direction === "rtl" }) });
      const body = await readJson<{ tenant?: TenantInfo }>(response); if (!response.ok || body.success === false) throw new Error(failureMessage(body as ApiFailure, response.status, text("saveFailed")));
      setTenant(body.tenant ?? null); setNotice(text("brandLocked")); setShowKeyManager(false); setRefreshKey((value) => value + 1);
    } catch (caught) { setBrandError(caught instanceof Error ? caught.message : text("saveFailed")); } finally { setLockingBrand(false); }
  }
  async function uploadLogo(file: File) { installAccessKeyFetch(); setBrandError(""); setUploadingLogo(true); const previewUrl = URL.createObjectURL(file); setLogoPreview(previewUrl); try { const prepared = await prepareLogoFile(file); const form = new FormData(); form.append("imageFile", prepared); form.append("autoCreate", "true"); form.append("autoCutout", "false"); form.append("assetRole", "logo"); const response = await fetch("/api/assets/upload", { method: "POST", headers: accessKeyHeaders({ Accept: "application/json" }), body: form }); const body = await readJson(response); if (!response.ok || body.success === false) throw new Error(failureMessage(body as ApiFailure, response.status, text("logoUploadFailed"))); const assetUrl = usableAssetUrl(body); if (!assetUrl) throw new Error(text("logoUploadFailed")); setBrandForm((previous) => ({ ...previous, logo_url: assetUrl })); setNotice(text("logoUploaded")); } catch (caught) { setBrandError(caught instanceof Error ? caught.message : text("logoUploadFailed")); } finally { URL.revokeObjectURL(previewUrl); setLogoPreview(""); setUploadingLogo(false); } }
  async function uploadImages(files: FileList | File[]) {
    const list = Array.from(files ?? []).filter((file) => file.type.startsWith("image/")); if (list.length === 0) return;
    installAccessKeyFetch(); setUploading(true); setError(""); let added = 0; let failed = 0; let lastSalesLine = "";
    for (const file of list) { const form = new FormData(); form.append("imageFile", file); form.append("autoCreate", "true"); form.append("autoCutout", "true"); try { const response = await fetch("/api/assets/upload", { method: "POST", headers: accessKeyHeaders({ Accept: "application/json" }), body: form }); const body = await readJson<{ salesLine?: string | null }>(response); if (!response.ok || body.success === false) throw new Error(failureMessage(body as ApiFailure, response.status, text("uploadFailed"))); added += 1; if (typeof body.salesLine === "string") lastSalesLine = body.salesLine; } catch (caught) { failed += 1; setError(caught instanceof Error ? caught.message : text("uploadFailed")); } }
    setUploading(false); setNotice(`${text("uploadDone")} ${added}${lastSalesLine ? ` · ${text("salesLine")}: ${lastSalesLine}` : ""}${failed ? ` · ${text("uploadFailed")} ${failed}` : ""}`); setLoading(true); setLoadError(""); setRefreshKey((value) => value + 1);
  }
  async function saveProductField(product: Product, patch: ProductPatch) { installAccessKeyFetch(); setError(""); try { const response = await fetch(`/api/db/products?id=${encodeURIComponent(product.id)}`, { method: "PATCH", headers: accessKeyHeaders({ "Content-Type": "application/json", Accept: "application/json" }), body: JSON.stringify(patch) }); const body = await readJson(response); if (!response.ok || body.success === false) throw new Error(failureMessage(body as ApiFailure, response.status, text("saveFailed"))); setNotice(text("saved")); setProducts((previous) => previous.map((item) => (item.id === product.id ? { ...item, ...patch } : item))); } catch (caught) { setError(caught instanceof Error ? caught.message : text("saveFailed")); } }
  async function generateAndDownload(body: Record<string, unknown>, retry = false) {
    installAccessKeyFetch(); const selectedIds = Array.isArray(body.productIds) ? (body.productIds as unknown[]).filter((id): id is string => typeof id === "string") : []; const isSingle = selectedIds.length === 1;
    setGenerating(true); setNotice(""); setError(""); setProgress({ phase: "preparing", detail: text("generationPreparing") }); if (!retry) setRetryBody(null);
    try {
      setProgress({ phase: "running", detail: isSingle ? text("generationSingleStatus") : `${text("generationBatchStatus")}…` });
      const response = await fetch("/api/db/campaigns/run", { method: "POST", headers: accessKeyHeaders({ "Content-Type": "application/json", Accept: "application/json" }), body: JSON.stringify(body), cache: "no-store" });
      const result = await readJson<CampaignResult>(response);
      if (!response.ok || result.success === false) { const failed = result as ApiFailure; if (failed.code === "already_generated") { setSelected([]); setLoading(true); setRefreshKey((value) => value + 1); } if (failed.code === "generation_rate_limited") { const seconds = Math.max(1, Number((failed as ApiFailure & { retry_after_seconds?: number }).retry_after_seconds) || 1); setRetryBody(body); setProgress({ phase: "busy", detail: `${failed.error || text("generationBusy")} · ${text("generationBusy")} ${seconds} ${text("generationSeconds")}`, retryAfterSeconds: seconds }); return; } throw new Error(failureMessage(failed, response.status, text("saveFailed"))); }
      const creatives = Array.isArray(result.creatives) ? result.creatives : [];
      if (creatives.length > 0) { const stamp = currentTimestamp(); setCampaigns((previous) => [{ id: result.generation?.campaignId || `pending-${stamp}`, status: "completed", total_images: creatives.length, creatives: creatives.map((creative, index): GalleryCreative => ({ id: creative.id || `pending-${stamp}-${index}`, product_id: creative.product_id || selectedIds[index] || "", campaign_id: result.generation?.campaignId ?? null, variant_number: creative.variant_number ?? index + 1, image_url: creative.image_url ?? null, svg: creative.svg ?? null, product_name_arabic: creative.product_name_arabic ?? null })) }, ...previous]); await downloadCreativesZip(creatives, `${IDESIGN_STUDIO_CONFIG.exportSlug}-${stamp}.zip`); }
      setNotice(result.message || `${text("generationDone")} ${creatives.length}`); setProgress({ phase: "complete", detail: text("generationComplete") }); setRetryBody(null); setSelected([]); setLoading(true); setRefreshKey((value) => value + 1);
    } catch (caught) { setProgress({ phase: "idle" }); setError(caught instanceof Error ? caught.message : text("saveFailed")); } finally { setGenerating(false); }
  }

  function previewSrc(creative: GalleryCreative): string | null { if (creative.image_url && /^data:image\/(svg\+xml|png|jpeg|webp)/i.test(creative.image_url)) return creative.image_url; if (/^https?:\/\//i.test(creative.image_url ?? "")) return creative.image_url ?? null; if (creative.svg?.trim().startsWith("<svg")) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(creative.svg)}`; return null; }

  return (
    <main dir={direction} className="min-h-screen bg-white text-slate-900">
      <header className="border-b border-blue-100 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <Link href="/" className="flex items-center gap-3" aria-label={IDESIGN_STUDIO_CONFIG.name}><StudioEmblem /><span className="leading-tight"><span className="block text-lg font-black text-[#1D4ED8]">{IDESIGN_STUDIO_CONFIG.name} · {IDESIGN_STUDIO_CONFIG.productName}</span><span className="block text-xs font-semibold text-slate-500" dir="ltr">{IDESIGN_STUDIO_CONFIG.tagline} · {IDESIGN_STUDIO_CONFIG.websiteLabel}</span></span></Link>
          <div className="flex flex-wrap items-center gap-2"><LanguageSwitcher language={language} onChange={chooseLanguage} label={text("language")} dir={direction}/><Link href="/" className="rounded-lg border border-blue-200 px-3 py-2 text-sm font-bold text-[#1D4ED8] transition hover:bg-blue-50">{text("home")}</Link><a href={IDESIGN_STUDIO_CONFIG.whatsappUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-[#2563EB] px-3 py-2 text-sm font-bold text-white transition hover:bg-[#1D4ED8]">{text("support")}</a></div>
        </div>
      </header>

      {workspaceReady && !showKeyManager ? (
        <section className="border-b border-emerald-100 bg-emerald-50/70" aria-live="polite">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-5 py-2 text-xs font-semibold">
            <span className="text-emerald-800">✓ {tenant?.brand?.brandName || text("brandLocked")} · {maskAccessKey(activeKey)}</span>
            <button type="button" onClick={() => setShowKeyManager(true)} className="rounded-md border border-emerald-300 bg-white px-2 py-1 text-[#1D4ED8]">{text("manageKey")}</button>
          </div>
        </section>
      ) : (
        <section className="border-b border-blue-100 bg-blue-50/70" aria-label={text("accessKey")}>
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-5 py-3">
            <label htmlFor="dashboard-access-key" className="shrink-0 text-sm font-extrabold text-[#1D4ED8]">{text("accessKey")}</label>
            <input id="dashboard-access-key" dir="ltr" type="password" autoComplete="off" spellCheck={false} value={accessKeyInput} placeholder={text("accessKeyPlaceholder")} onChange={(event) => setManualKey(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm sm:min-w-[220px]" />
            <button type="button" onClick={() => void applyAccessKey()} className="rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#1D4ED8]">{text("applyKey")}</button>
            {workspaceReady ? <button type="button" onClick={() => setShowKeyManager(false)} className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-bold text-[#1D4ED8]">×</button> : null}
            <p className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-slate-600"><span dir="ltr">{text("keyStatus")}: {checkingKey ? "…" : maskAccessKey(activeKey)}</span><span>{text("brandStatus")}: {tenant?.brand?.brandName || (tenant ? text("brandSetupRequired") : "—")}</span><span>{text("remainingCount")}: {remaining.length} · {text("generatedCount")}: {generated.length}</span></p>
          </div>
          {tenantError ? <p role="alert" className="mx-auto max-w-6xl px-5 pb-3 text-xs font-semibold text-red-700">{tenantError}</p> : null}
        </section>
      )}

      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-5">
        {topCreatives.length > 0 ? (
          <section className="overflow-hidden rounded-2xl border-2 border-[#2563EB] bg-[#1D4ED8] shadow-sm" aria-labelledby="top-creatives-heading">
            <div className="flex items-center justify-between gap-3 px-4 py-3 text-white"><div><h2 id="top-creatives-heading" className="text-lg font-black">{text("generatedCreativesTitle")}</h2><p className="text-xs text-blue-100">{topCreatives.length} {text("generatedCount")}</p></div><button type="button" onClick={() => document.getElementById("full-creatives-gallery")?.scrollIntoView({ behavior: "smooth", block: "start" })} className="rounded-lg bg-white px-3 py-2 text-xs font-black text-[#1D4ED8]">{text("viewAllCreatives")}</button></div>
            <div className="flex gap-3 overflow-x-auto bg-blue-950/10 p-3" dir="ltr">
              {topCreatives.map((creative) => { const src = previewSrc(creative); return <article key={creative.id} className="w-[112px] shrink-0 overflow-hidden rounded-xl border border-white/40 bg-white p-1.5 sm:w-[132px]"><div className="aspect-[9/16] overflow-hidden rounded-lg bg-blue-50">{src ? <Image src={src} alt={creative.product_name_arabic || text("creativeProductFallback")} width={132} height={235} unoptimized className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center text-xs text-slate-400">—</div>}</div><button type="button" disabled={!src} onClick={() => src && void downloadCreativePng({ id: creative.id, product_id: creative.product_id, product_name_arabic: creative.product_name_arabic ?? null, variant_number: creative.variant_number ?? null, image_url: creative.image_url ?? null, svg: creative.svg ?? null })} className="mt-1.5 w-full rounded-md bg-[#2563EB] px-1 py-1.5 text-[10px] font-bold text-white disabled:opacity-50">{text("downloadImage")}</button></article>; })}
            </div>
          </section>
        ) : null}

        {needsBrandSetup ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5 shadow-sm"><div className="mb-4"><h2 className="text-lg font-black text-[#1D4ED8]">{text("brandSetupTitle")}</h2><p className="mt-1 text-sm text-slate-700">{text("brandSetupHint")}</p>{tenant?.provisioning?.brand_defaults ? <p className="mt-1 text-xs font-semibold text-[#1D4ED8]">{text("provisionedDefaults")}</p> : null}</div><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">{text("brandName")}<input dir="auto" value={brandForm.brand_name} onChange={(event) => setBrandForm((previous) => ({ ...previous, brand_name: event.target.value }))} className="mt-1 w-full rounded-lg border border-blue-200 bg-white px-3 py-2" /></label><label className="text-sm font-semibold">{text("industry")}<input dir="auto" value={brandForm.industry} onChange={(event) => setBrandForm((previous) => ({ ...previous, industry: event.target.value }))} className="mt-1 w-full rounded-lg border border-blue-200 bg-white px-3 py-2" /></label><label className="text-sm font-semibold sm:col-span-2">{text("logoUrl")}<input dir="ltr" type="url" value={brandForm.logo_url} onChange={(event) => setBrandForm((previous) => ({ ...previous, logo_url: event.target.value }))} className="mt-1 w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm" /></label><label className="text-sm font-semibold sm:col-span-2">{text("logoFile")}<input type="file" accept={logoAcceptAttribute()} className="mt-1 block w-full text-sm" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (!file) return; if (!isSupportedLogoMime(file.type)) { setBrandError(text("logoUploadFailed")); return; } void uploadLogo(file); }} /><span className="mt-1 block text-xs font-normal text-slate-500">{uploadingLogo ? text("logoUploading") : text("logoFileHint")}</span></label>{logoPreview || brandForm.logo_url ? <div className="flex items-center gap-3 rounded-lg border border-blue-100 bg-white p-3 sm:col-span-2"><Image src={logoPreview || brandForm.logo_url} alt={text("logoFile")} width={72} height={72} unoptimized className="h-16 w-16 rounded-md object-contain" /><span className="flex-1 text-xs text-slate-500">{uploadingLogo ? text("logoUploading") : text("logoUploaded")}</span><button type="button" onClick={() => setBrandForm((previous) => ({ ...previous, logo_url: "" }))} className="rounded-md border border-blue-200 px-2 py-1 text-xs font-bold text-[#1D4ED8]">{text("logoRemove")}</button></div> : null}<label className="text-sm font-semibold sm:col-span-2">{text("contactInfo")}<input dir="auto" value={brandForm.contact_info} onChange={(event) => setBrandForm((previous) => ({ ...previous, contact_info: event.target.value }))} className="mt-1 w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm" /></label></div>{brandError ? <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{brandError}</p> : null}<button type="button" disabled={lockingBrand} onClick={() => void lockBrand()} className="mt-4 rounded-lg bg-[#1D4ED8] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#1E40AF] disabled:opacity-50">{lockingBrand ? text("lockingBrand") : text("lockBrand")}</button></section>
        ) : null}

        <section className="grid gap-5 lg:grid-cols-[0.72fr_1.28fr]">
          <aside className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
            <button type="button" onClick={() => setProductDrawerOpen((value) => !value)} aria-expanded={productDrawerOpen} className="flex w-full items-center justify-between rounded-xl bg-blue-50 px-3 py-3 text-start text-sm font-black text-[#1D4ED8] lg:cursor-default" ><span>{text("productLibrary")} · {products.length}</span><span className="lg:hidden">{productDrawerOpen ? "−" : "+"}</span></button>
            <label className="mt-3 block cursor-pointer rounded-xl border-2 border-dashed border-blue-300 bg-white p-4 text-center transition hover:border-[#1D4ED8]">
              <span className="block text-sm font-extrabold text-[#1D4ED8]">{uploading ? text("uploading") : text("upload")}</span>
              <span className="mt-1 block text-xs text-slate-500">{text("uploadHint")}</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                disabled={uploading}
                className="mt-3 block w-full text-sm"
                onChange={(event) => {
                  void uploadImages(event.currentTarget.files ?? []);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <div className={`${productDrawerOpen ? "block" : "hidden"} mt-3 max-h-[420px] space-y-2 overflow-y-auto lg:block`}>
              {loading ? <p className="py-6 text-center text-xs text-slate-500">…</p> : products.length === 0 ? <p className="rounded-lg bg-blue-50 p-4 text-center text-xs text-slate-600">{text("empty")}</p> : products.map((product) => <article key={product.id} className={`rounded-xl border p-2.5 ${selectedProductId === product.id ? "border-[#2563EB] bg-blue-50" : "border-blue-100 bg-white"}`}><button type="button" onClick={() => { setSelectedProductId(product.id); setSelected([product.id]); }} className="flex w-full items-center gap-2 text-start"><Image src={product.image_url || "/favicon.svg"} alt={product.name_arabic} width={48} height={48} unoptimized className="h-12 w-12 shrink-0 rounded-lg border border-blue-100 object-contain" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-black">{product.name_arabic}</span><span className="block text-[11px] text-slate-500">{product.last_advertised_at ? text("generated") : text("remaining")}</span></span></button><button type="button" disabled={generating} onClick={() => void generateAndDownload({ mode: "basic", productIds: [product.id] })} className="mt-2 w-full rounded-lg border border-[#2563EB] px-2 py-1.5 text-xs font-bold text-[#1D4ED8] disabled:opacity-50">{text("generateAgain")}</button></article>)}
            </div>
          </aside>

          <section className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-black">{selectedProduct ? text("selectedProduct") : text("products")}</h2><p className="text-sm text-slate-500">{selectedProduct ? selectedProduct.name_arabic : text("productsHint")}</p></div><div className="flex flex-wrap items-center gap-2"><label className="flex items-center gap-2 text-sm font-semibold">{text("count")}<input type="number" min={1} max={MAX_COUNT} value={customCount} onChange={(event) => setCustomCount(Math.max(1, Math.min(MAX_COUNT, Number(event.target.value) || 1)))} className="w-20 rounded-lg border border-blue-200 px-2 py-1" /></label><button type="button" disabled={generating || needsBrandSetup} onClick={() => void generateAndDownload({ mode: "basic", count: customCount })} className="rounded-lg bg-[#1D4ED8] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#1E40AF] disabled:opacity-50">{generating ? text("generating") : text("generateNext")}</button></div></div>
            {selectedProduct ? <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold sm:col-span-2">{text("productName")}<input dir="auto" defaultValue={selectedProduct.name_arabic} onBlur={(event) => { const value = event.target.value.trim(); if (value && value !== selectedProduct.name_arabic) void saveProductField(selectedProduct, { name_arabic: value }); }} className="mt-1 w-full rounded-lg border border-blue-200 px-3 py-2 font-bold" /></label><label className="text-sm font-semibold">{text("salesLine")}<input dir="auto" defaultValue={selectedProduct.sales_line ?? ""} onBlur={(event) => { const value = event.target.value.trim(); if (value !== (selectedProduct.sales_line ?? "")) void saveProductField(selectedProduct, { sales_line: value }); }} className="mt-1 w-full rounded-lg border border-blue-200 px-3 py-2 text-sm" /></label><label className="text-sm font-semibold">{text("price")}<input dir="ltr" type="number" min={0} defaultValue={selectedProduct.price ?? ""} onBlur={(event) => { const value = event.target.value; const nextPrice = value === "" ? null : Number(value); if (nextPrice !== selectedProduct.price) void saveProductField(selectedProduct, { price: nextPrice }); }} className="mt-1 w-full rounded-lg border border-blue-200 px-3 py-2 text-sm" /></label><label className="text-sm font-semibold sm:col-span-2">{text("offer")}<input dir="auto" defaultValue={selectedProduct.offer_text ?? ""} onBlur={(event) => { const value = event.target.value.trim() || null; if (value !== (selectedProduct.offer_text ?? null)) void saveProductField(selectedProduct, { offer_text: value }); }} className="mt-1 w-full rounded-lg border border-blue-200 px-3 py-2 text-sm" /></label><button type="button" disabled={generating || needsBrandSetup} onClick={() => void generateAndDownload({ mode: "basic", productIds: [selectedProduct.id] })} className="rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-bold text-white sm:col-span-2 disabled:opacity-50">{text("generateAgain")}</button></div> : <div className="flex min-h-48 items-center justify-center rounded-xl border border-dashed border-blue-200 bg-blue-50/40 p-6 text-center text-sm text-slate-600">{text("selectProductPrompt")}</div>}

            {progress.phase !== "idle" ? <div role="status" aria-live="polite" className={`mt-4 rounded-lg border p-3 text-sm ${progress.phase === "busy" ? "border-amber-200 bg-amber-50 text-amber-900" : progress.phase === "complete" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-blue-200 bg-blue-50 text-blue-900"}`}><div className="flex flex-wrap items-center justify-between gap-2"><span>{progress.phase === "preparing" || progress.phase === "running" ? <span aria-hidden="true" className="me-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent align-middle" /> : null}{progress.detail}</span>{progress.phase === "busy" && retryBody ? <button type="button" disabled={generating} onClick={() => void generateAndDownload(retryBody, true)} className="rounded-md border border-amber-400 px-2 py-1 text-xs font-bold disabled:opacity-50">{text("retryGeneration")}</button> : null}</div>{progress.phase === "running" ? <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-blue-100"><div className="h-full w-1/3 animate-pulse rounded-full bg-[#1D4ED8]" /></div> : null}</div> : null}
            {notice ? <p role="status" className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">{notice}</p> : null}{error || loadError ? <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error || loadError}</p> : null}
          </section>
        </section>

        <div id="full-creatives-gallery"><GeneratedCreativesGallery campaigns={campaigns} products={products} language={language} loading={galleryLoading} error={galleryError} onRefresh={() => setRefreshKey((value) => value + 1)} /></div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-blue-100 py-6 text-xs text-slate-500"><p className="flex items-center gap-2"><IDMark small /> {IDESIGN_STUDIO_CONFIG.productName} {IDESIGN_STUDIO_CONFIG.tagline}</p><p className="flex flex-wrap gap-3"><a href={IDESIGN_STUDIO_CONFIG.websiteUrl} className="text-blue-700 underline" dir="ltr">{IDESIGN_STUDIO_CONFIG.websiteLabel}</a><a href={IDESIGN_STUDIO_CONFIG.emailUrl} className="text-blue-700 underline" dir="ltr">{IDESIGN_STUDIO_CONFIG.email}</a><a href={IDESIGN_STUDIO_CONFIG.whatsappUrl} className="text-blue-700 underline" dir="ltr">{IDESIGN_STUDIO_CONFIG.phoneLabel}</a></p></footer>
      </div>
    </main>
  );
}
