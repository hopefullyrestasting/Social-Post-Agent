"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { AL_RAHMA_BRAND_CONFIG } from "@/lib/al-rahma/brand-core";

type Brand = {
  id: string;
  name_arabic: string;
  name_english: string | null;
  slug: string;
  identity_status: string;
  product_count: number;
};

type Product = {
  id: string;
  name_arabic: string;
  name_english: string | null;
  category: string | null;
  subcategory: string | null;
  packaging_size: string | null;
  variant: string | null;
  egypt_market_status: string | null;
  warehouse_stock_status: string | null;
  verification_status: string;
  confidence_score: number | null;
  brand_arabic: string;
  brand_english: string | null;
  brand_slug: string;
  image_url: string | null;
  image_source: string | null;
};

type Stats = {
  products: number;
  brands: number;
  needsVerification: number;
  verified: number;
  referenceImages: number;
  campaigns: number;
  generatedImages: number;
};

type Research = {
  product: {
    id: string;
    name_arabic: string;
    name_english: string | null;
    category: string | null;
    subcategory: string | null;
    packaging_size: string | null;
    variant: string | null;
    verification_status: string;
    brand_arabic: string;
    brand_english: string | null;
    brand_slug: string;
  };
  referenceImages: {
    id: string;
    image_url: string | null;
    source_url: string | null;
    image_type: string | null;
    verification_status: string | null;
    is_primary: number;
  }[];
  informationSources: {
    id: string;
    source_url: string;
    source_name: string | null;
    source_type: string;
    verification_status: string;
    retrieved_at: number | null;
    notes: string | null;
  }[];
  verifiedBenefits: ResearchClaim[];
  verifiedUsage: ResearchClaim[];
  unverifiedClaims: ResearchClaim[];
  stockChecks: {
    id: string;
    stock_status: string;
    checked_at: number;
    checked_by: string | null;
    notes: string | null;
  }[];
  latestStockStatus: string | null;
};

type ResearchClaim = {
  id: string;
  source_id: string;
  source_name: string | null;
  source_url: string;
  claim_type: "benefit" | "usage";
  claim_text: string;
  verification_status: string;
  verified_at: number | null;
  notes: string | null;
};

type ApiResult<T> =
  | ({ success: true } & T)
  | { success: false; error?: string; detail?: string };

const PAGE_SIZE = 50;
const BRAND = AL_RAHMA_BRAND_CONFIG;

const verificationLabels: Record<string, string> = {
  verified: "موثّق",
  needs_verification: "يحتاج مراجعة",
  probable: "محتمل",
  unconfirmed: "غير مؤكد",
  discontinued: "متوقف",
};

const categoryLabels: Record<string, string> = {
  baby_care: "العناية بالأطفال",
  conditioner: "بلسم",
  fragrance: "عطور",
  hair_mask: "ماسك الشعر",
  oil: "زيوت",
  other: "أخرى",
  shampoo: "شامبو",
  styling: "تصفيف الشعر",
};

function categoryLabel(category: string) {
  return categoryLabels[category] ?? category.replaceAll("_", " ");
}

function verificationLabel(status: string) {
  return verificationLabels[status] ?? status;
}

function identityLabel(status: string) {
  if (status === "verified") return "هوية موثّقة";
  if (status === "identity_unconfirmed") return "هوية غير مؤكدة";
  return "هوية تحتاج مراجعة";
}

function stockLabel(status: string | null) {
  if (!status || status === "unknown") return "غير مسجل";
  if (status === "in_stock") return "متوفر";
  if (status === "out_of_stock") return "غير متوفر";
  return status;
}

async function requestApi<T>(
  url: string,
  signal: AbortSignal,
): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal,
  });
  const body = (await response.json()) as ApiResult<T>;

  if (!response.ok || !body.success) {
    const failure = body as { error?: string; detail?: string };
    throw new Error(
      failure.detail ||
        failure.error ||
        `تعذر تحميل البيانات (${response.status})`,
    );
  }

  return body;
}

export default function DashboardPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [brandSlug, setBrandSlug] = useState("");
  const [category, setCategory] = useState("");
  const [verificationStatus, setVerificationStatus] = useState("");
  const [page, setPage] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [overviewError, setOverviewError] = useState("");
  const [productsError, setProductsError] = useState("");
  const [researchProduct, setResearchProduct] = useState<Product | null>(null);
  const [research, setResearch] = useState<Research | null>(null);
  const [researchLoading, setResearchLoading] = useState(false);
  const [researchError, setResearchError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    Promise.all([
      requestApi<{ brands: Brand[] }>("/api/db/brands", controller.signal),
      requestApi<{ stats: Stats }>("/api/db/stats", controller.signal),
    ])
      .then(([brandResult, statsResult]) => {
        setBrands(brandResult.brands);
        setStats(statsResult.stats);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setOverviewError(
            error instanceof Error ? error.message : "تعذر تحميل بيانات لوحة التحكم",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingOverview(false);
      });

    return () => controller.abort();
  }, [refreshKey]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    });

    if (search.trim()) params.set("q", search.trim());
    if (brandSlug) params.set("brand", brandSlug);
    if (category) params.set("category", category);
    if (verificationStatus) params.set("status", verificationStatus);

    requestApi<{
      products: Product[];
      total: number;
      categories: string[];
    }>(`/api/db/products?${params.toString()}`, controller.signal)
      .then((result) => {
        setProducts(result.products);
        setTotal(result.total);
        setCategories(result.categories);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setProducts([]);
          setTotal(0);
          setProductsError(
            error instanceof Error ? error.message : "تعذر تحميل المنتجات",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingProducts(false);
      });

    return () => controller.abort();
  }, [search, brandSlug, category, verificationStatus, page, refreshKey]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstProduct = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const lastProduct = Math.min((page + 1) * PAGE_SIZE, total);
  const error = overviewError || productsError;

  function refresh() {
    setLoadingOverview(true);
    setLoadingProducts(true);
    setOverviewError("");
    setProductsError("");
    setRefreshKey((value) => value + 1);
  }

  function clearFilters() {
    setLoadingProducts(true);
    setProductsError("");
    setSearch("");
    setBrandSlug("");
    setCategory("");
    setVerificationStatus("");
    setPage(0);
  }

  async function showResearch(product: Product) {
    if (researchProduct?.id === product.id) {
      setResearchProduct(null);
      setResearch(null);
      setResearchError("");
      return;
    }

    setResearchProduct(product);
    setResearch(null);
    setResearchError("");
    setResearchLoading(true);
    try {
      const result = await requestApi<{ research: Research }>(
        `/api/db/research?product_id=${encodeURIComponent(product.id)}`,
        new AbortController().signal,
      );
      setResearch(result.research);
    } catch (error) {
      setResearchError(
        error instanceof Error ? error.message : "تعذر تحميل بيانات البحث",
      );
    } finally {
      setResearchLoading(false);
    }
  }

  const statCards = [
    { label: "إجمالي المنتجات", value: stats?.products },
    { label: "إجمالي البراندات", value: stats?.brands },
    { label: "منتجات موثّقة", value: stats?.verified },
    { label: "تحتاج إلى التحقق", value: stats?.needsVerification },
    { label: "صور مرجعية متاحة", value: stats?.referenceImages },
    { label: "حملات منشأة", value: stats?.campaigns },
    { label: "صور إعلانية منشأة", value: stats?.generatedImages },
  ];

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-[#071d3b] text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5">
          <div>
            <p className="text-sm text-cyan-200">
              نظام إدارة منتجات {BRAND.brandName}
            </p>
            <h1 className="mt-1 text-2xl font-black">{BRAND.brandName}</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-300">
              {BRAND.activity}
            </p>
          </div>
          <a
            className="rounded-xl bg-emerald-500 px-4 py-3 font-bold text-white transition hover:bg-emerald-400"
            href={BRAND.contact.whatsappUrl}
            target="_blank"
            rel="noreferrer"
          >
            واتساب {BRAND.contact.phone}
          </a>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-7 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold">لوحة التحكم</h2>
            <p className="text-sm text-slate-500">
              مؤشرات المنتجات والكتالوج تُقرأ مباشرة من قاعدة D1
            </p>
          </div>
          <button
            type="button"
            onClick={refresh}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold transition hover:bg-slate-50"
          >
            تحديث البيانات ↻
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800"
          >
            تعذر تحميل بيانات قاعدة البيانات: {error}
          </div>
        )}

        <section
          aria-label="ملخص قاعدة البيانات"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7"
        >
          {statCards.map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-slate-200 bg-white p-4"
            >
              <p className="text-xs leading-5 text-slate-500">{item.label}</p>
              <p className="mt-2 text-2xl font-black">
                {loadingOverview ? "…" : (item.value ?? "—")}
              </p>
            </div>
          ))}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="font-extrabold">إدارة البراندات</h3>
              <p className="mt-1 text-sm text-slate-500">
                الأسماء وحالات الهوية وأعداد المنتجات من D1
              </p>
            </div>
            <span className="text-sm text-slate-500">
              {loadingOverview ? "جاري التحميل..." : `${brands.length} براند`}
            </span>
          </div>
          {brands.length === 0 && !loadingOverview ? (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              لا توجد براندات لعرضها.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {brands.map((item) => (
                <article
                  key={item.id}
                  className="rounded-xl border border-slate-200 p-4"
                >
                  <p className="font-bold">{item.name_arabic}</p>
                  <p className="text-sm text-slate-500">
                    {item.name_english || item.slug}
                  </p>
                  <p className="mt-3 text-sm">
                    <b>{item.product_count}</b> منتج
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    {identityLabel(item.identity_status)}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="font-extrabold">كتالوج المنتجات</h3>
              <p className="mt-1 text-sm text-slate-500">
                ابحث وصفِّ النتائج، ثم تنقّل بين صفحات الكتالوج كاملة
              </p>
            </div>
            <span aria-live="polite" className="text-sm text-slate-500">
              {loadingProducts
                ? "جاري تحميل المنتجات..."
                : `عرض ${firstProduct}–${lastProduct} من ${total}`}
            </span>
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm font-semibold text-slate-700">
              البحث
              <input
                type="search"
                value={search}
                onChange={(event) => {
                  setLoadingProducts(true);
                  setProductsError("");
                  setSearch(event.target.value);
                  setPage(0);
                }}
                placeholder="اسم المنتج أو التصنيف..."
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal"
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              البراند
              <select
                value={brandSlug}
                onChange={(event) => {
                  setLoadingProducts(true);
                  setProductsError("");
                  setBrandSlug(event.target.value);
                  setPage(0);
                }}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal"
              >
                <option value="">كل البراندات</option>
                {brands.map((item) => (
                  <option key={item.id} value={item.slug}>
                    {item.name_arabic}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700">
              التصنيف
              <select
                value={category}
                onChange={(event) => {
                  setLoadingProducts(true);
                  setProductsError("");
                  setCategory(event.target.value);
                  setPage(0);
                }}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal"
              >
                <option value="">كل التصنيفات</option>
                {categories.map((item) => (
                  <option key={item} value={item}>
                    {categoryLabel(item)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700">
              حالة التحقق
              <select
                value={verificationStatus}
                onChange={(event) => {
                  setLoadingProducts(true);
                  setProductsError("");
                  setVerificationStatus(event.target.value);
                  setPage(0);
                }}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal"
              >
                <option value="">كل الحالات</option>
                <option value="needs_verification">يحتاج مراجعة</option>
                <option value="verified">موثّق</option>
                <option value="probable">محتمل</option>
                <option value="unconfirmed">غير مؤكد</option>
                <option value="discontinued">متوقف</option>
              </select>
            </label>
          </div>

          {productsError && (
            <div
              role="alert"
              className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            >
              تعذر تحميل كتالوج المنتجات: {productsError}
            </div>
          )}

          {loadingProducts ? (
            <p className="py-8 text-center text-slate-500">
              جاري تحميل المنتجات من D1...
            </p>
          ) : products.length === 0 ? (
            <div className="rounded-xl bg-slate-50 p-6 text-center text-slate-600">
              {total === 0 && (search || brandSlug || category || verificationStatus)
                ? "لا توجد نتائج مطابقة للفلاتر الحالية."
                : "لا توجد منتجات لعرضها."}
              {(search || brandSlug || category || verificationStatus) && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="ms-2 font-bold text-emerald-700 underline"
                >
                  مسح الفلاتر
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[980px] text-right text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th scope="col" className="p-3">المنتج</th>
                      <th scope="col" className="p-3">البراند</th>
                      <th scope="col" className="p-3">التصنيف</th>
                      <th scope="col" className="p-3">الحجم والمتغير</th>
                      <th scope="col" className="p-3">حالة المخزون</th>
                      <th scope="col" className="p-3">التحقق</th>
                      <th scope="col" className="p-3">مرجع الصورة</th>
                      <th scope="col" className="p-3">البحث</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((item) => (
                      <tr key={item.id} className="border-t border-slate-100">
                        <td className="p-3">
                          <div className="flex items-center gap-3">
                            {item.image_url ? (
                              <Image
                                src={item.image_url}
                                alt={item.name_arabic}
                                width={56}
                                height={56}
                                loading="lazy"
                                unoptimized
                                className="h-14 w-14 rounded-lg border border-slate-200 object-contain"
                                onError={(event) => {
                                  event.currentTarget.style.visibility = "hidden";
                                }}
                              />
                            ) : (
                              <div
                                aria-hidden="true"
                                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-400"
                              >
                                بلا صورة
                              </div>
                            )}
                            <div>
                              <p className="font-bold">{item.name_arabic}</p>
                              <p className="text-xs text-slate-500">
                                {item.name_english || "—"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="p-3">
                          {item.brand_arabic}
                          {item.brand_english && (
                            <span className="mt-1 block text-xs text-slate-500">
                              {item.brand_english}
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          {item.category ? categoryLabel(item.category) : "—"}
                          {item.subcategory && (
                            <span className="mt-1 block text-xs text-slate-500">
                              {categoryLabel(item.subcategory)}
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          {item.packaging_size || "—"}
                          {item.variant && (
                            <span className="mt-1 block text-xs text-slate-500">
                              {item.variant}
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          {stockLabel(item.warehouse_stock_status)}
                        </td>
                        <td className="p-3">
                          <span className="rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-800">
                            {verificationLabel(item.verification_status)}
                          </span>
                        </td>
                        <td className="p-3">
                          {item.image_source ? (
                            <a
                              href={item.image_source}
                              target="_blank"
                              rel="noreferrer"
                              className="font-semibold text-emerald-700 underline"
                            >
                              مرجع الصورة
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="p-3">
                          <button
                            type="button"
                            onClick={() => showResearch(item)}
                            className="font-semibold text-emerald-700 underline"
                          >
                            {researchProduct?.id === item.id
                              ? "إغلاق"
                              : "المصادر والتحقق"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {researchProduct && (
                <section
                  aria-live="polite"
                  className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4"
                >
                  <h4 className="font-bold">
                    بحث المنتج: {researchProduct.name_arabic}
                  </h4>
                  {researchLoading && (
                    <p className="mt-3 text-sm text-slate-600">
                      جاري تحميل مصادر المنتج والتحقق منه...
                    </p>
                  )}
                  {researchError && (
                    <p role="alert" className="mt-3 text-sm text-red-700">
                      تعذر تحميل بيانات البحث: {researchError}
                    </p>
                  )}
                  {research && (
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div>
                        <h5 className="font-semibold">هوية المنتج</h5>
                        <p className="mt-1 text-sm">
                          {research.product.name_arabic}
                          {research.product.name_english
                            ? ` · ${research.product.name_english}`
                            : ""}
                        </p>
                        <p className="text-sm text-slate-600">
                          {research.product.brand_arabic}
                          {research.product.brand_english
                            ? ` · ${research.product.brand_english}`
                            : ""}
                          {" · "}
                          {verificationLabel(
                            research.product.verification_status,
                          )}
                        </p>
                      </div>

                      <div>
                        <h5 className="font-semibold">صور المنتج المرجعية</h5>
                        {research.referenceImages.length ? (
                          <ul className="mt-1 space-y-1 text-sm">
                            {research.referenceImages.map((image) => (
                              <li key={image.id}>
                                {image.image_url ? (
                                  <a
                                    href={image.image_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-emerald-800 underline"
                                  >
                                    {image.is_primary ? "الصورة الأساسية" : "صورة مرجعية"}
                                  </a>
                                ) : (
                                  "الصورة بدون رابط متاح"
                                )}
                                {" · "}
                                {image.verification_status || "غير موثقة"}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-1 text-sm text-slate-600">
                            لا توجد صور مرجعية مسجلة لهذا المنتج.
                          </p>
                        )}
                      </div>

                      <div>
                        <h5 className="font-semibold">مصادر معلومات المنتج</h5>
                        {research.informationSources.length ? (
                          <ul className="mt-1 space-y-1 text-sm">
                            {research.informationSources.map((source) => (
                              <li key={source.id}>
                                <a
                                  href={source.source_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-emerald-800 underline"
                                >
                                  {source.source_name || source.source_url}
                                </a>
                                {" · "}
                                {source.verification_status === "verified"
                                  ? "مصدر موثّق"
                                  : source.verification_status}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-1 text-sm text-slate-600">
                            لم تُسجل مصادر معلومات بعد.
                          </p>
                        )}
                      </div>

                      <div>
                        <h5 className="font-semibold">فوائد موثّقة بمصدر</h5>
                        {research.verifiedBenefits.length ? (
                          <ul className="mt-1 list-inside list-disc space-y-1 text-sm">
                            {research.verifiedBenefits.map((claim) => (
                              <li key={claim.id}>
                                {claim.claim_text}
                                {" · "}
                                <a
                                  href={claim.source_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-emerald-800 underline"
                                >
                                  {claim.source_name || "المصدر"}
                                </a>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-1 text-sm text-slate-600">
                            لا توجد فوائد موثّقة؛ لن تُعرض ادعاءات غير مؤكدة.
                          </p>
                        )}
                      </div>

                      <div>
                        <h5 className="font-semibold">طريقة الاستخدام الموثّقة</h5>
                        {research.verifiedUsage.length ? (
                          <ul className="mt-1 list-inside list-disc space-y-1 text-sm">
                            {research.verifiedUsage.map((claim) => (
                              <li key={claim.id}>
                                {claim.claim_text}
                                {" · "}
                                <a
                                  href={claim.source_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-emerald-800 underline"
                                >
                                  {claim.source_name || "المصدر"}
                                </a>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-1 text-sm text-slate-600">
                            لا توجد طريقة استخدام موثّقة مسجلة.
                          </p>
                        )}
                      </div>

                      <div>
                        <h5 className="font-semibold">تأكيد مخزون المستودع</h5>
                        <p className="mt-1 text-sm">
                          آخر حالة: {stockLabel(research.latestStockStatus)}
                        </p>
                        {research.stockChecks.length > 0 && (
                          <p className="text-xs text-slate-600">
                            تأكيد بواسطة:{" "}
                            {research.stockChecks[0].checked_by || "غير مسجل"}
                          </p>
                        )}
                      </div>

                      {research.unverifiedClaims.length > 0 && (
                        <div className="md:col-span-2">
                          <h5 className="font-semibold text-amber-800">
                            معلومات غير موثّقة — ليست ادعاءات معتمدة
                          </h5>
                          <ul className="mt-1 list-inside list-disc space-y-1 text-sm text-slate-700">
                            {research.unverifiedClaims.map((claim) => (
                              <li key={claim.id}>{claim.claim_text}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </section>
              )}

              <nav
                aria-label="صفحات المنتجات"
                className="mt-4 flex flex-wrap items-center justify-between gap-3"
              >
                <p className="text-sm text-slate-500">
                  الصفحة {page + 1} من {pageCount}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={page === 0}
                    onClick={() => {
                      setLoadingProducts(true);
                      setProductsError("");
                      setPage((value) => Math.max(0, value - 1));
                    }}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    السابق
                  </button>
                  <button
                    type="button"
                    disabled={page + 1 >= pageCount}
                    onClick={() => {
                      setLoadingProducts(true);
                      setProductsError("");
                      setPage((value) => value + 1);
                    }}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    التالي
                  </button>
                </div>
              </nav>
            </>
          )}
        </section>

        <p className="text-center text-xs text-slate-500">
          {BRAND.legalName} · للطلب والاستفسار: {BRAND.contact.phone}
        </p>
      </div>
    </main>
  );
}
