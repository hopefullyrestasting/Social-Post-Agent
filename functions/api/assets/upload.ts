/**
 * POST /api/assets/upload
 *
 * Dashboard upload for real product packshots. One request binds one photo to
 * one D1 product and publishes it as that product's primary verified reference
 * image, so the Phase 18 campaign runner picks it up on the next run.
 *
 * This is the manual/bulk-filename flow. The Vision AI flow shares the exact
 * same storage pipeline through `_store.ts` (`/api/assets/commit-match`).
 *
 * D1 note: this repository's canonical image table is `product_assets` (the
 * baseline schema has no `product_images`), so uploads land where
 * `/api/db/stats`, `/api/db/products` and `campaigns/run` already read them.
 */

import {
  normalizeImageMime,
  MAX_IMAGE_BYTES,
} from "./_image";
import { resolveTenantScope } from "../_tenant";
import {
  isHttpUrl,
  loadProduct,
  noStore,
  parseLineClaims,
  storeProductAsset,
  type AssetStoreEnv,
} from "./_store";
import { predictProductFromImage } from "./_vision";
import {
  buildStudioSalesLine,
  isSafeSalesLine,
  resolveSalesLine,
  sanitizeSalesLine,
} from "../../../src/lib/al-rahma/studio-fields";

export type UploadEnv = AssetStoreEnv;

const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  avif: "image/avif",
};

function mimeFromFileName(fileName: string): string | null {
  const extension = fileName.split(".").pop()?.trim().toLowerCase() ?? "";
  return normalizeImageMime(MIME_BY_EXTENSION[extension] ?? null);
}

function textField(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function fileFromForm(form: FormData): File | null {
  const candidate =
    form.get("imageFile") ?? form.get("file") ?? form.get("image");
  if (!candidate) return null;
  if (typeof candidate === "string") return null;
  if (typeof (candidate as File).arrayBuffer !== "function") return null;
  return candidate as File;
}

export const onRequestPost: PagesFunction<UploadEnv> = async ({
  request,
  env,
}) => {
  const scope = await resolveTenantScope(request, env);
  if (!scope.ok) return scope.response;

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return noStore(
      {
        success: false,
        error: "Use multipart/form-data with productId and imageFile.",
      },
      415,
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return noStore({ success: false, error: "Malformed multipart body." }, 400);
  }

  const productId = textField(form, "productId");
  const assetRoleRaw = textField(form, "assetRole").toLowerCase();
  if (assetRoleRaw && assetRoleRaw !== "product" && assetRoleRaw !== "logo") {
    return noStore({ success: false, error: "Invalid assetRole." }, 400);
  }
  const assetRole = assetRoleRaw === "logo" ? "logo" : "product";
  const autoCreateRaw = textField(form, "autoCreate").toLowerCase();
  const autoCreate = autoCreateRaw === "true" || autoCreateRaw === "1" || !productId;
  if (productId && productId.length > 100) {
    return noStore({ success: false, error: "Invalid productId." }, 400);
  }

  const salesLineInput = textField(form, "salesLine").slice(0, 120);
  if (salesLineInput && !isSafeSalesLine(salesLineInput)) {
    return noStore(
      { success: false, error: "salesLine must be a short, claim-free phrase." },
      400,
    );
  }
  const salesLine = sanitizeSalesLine(salesLineInput);

  const imageFile = fileFromForm(form);
  if (!imageFile) {
    return noStore({ success: false, error: "Missing imageFile." }, 400);
  }

  const mime =
    normalizeImageMime(imageFile.type) || mimeFromFileName(imageFile.name);
  if (!mime) {
    return noStore(
      {
        success: false,
        error: "Unsupported image type. Use PNG, JPEG, WebP or AVIF.",
      },
      415,
    );
  }
  if (
    assetRole === "logo" &&
    mime !== "image/png" &&
    mime !== "image/jpeg" &&
    mime !== "image/webp"
  ) {
    return noStore(
      { success: false, error: "Logo files must be PNG, JPEG or WebP." },
      415,
    );
  }

  if (!imageFile.size) {
    return noStore({ success: false, error: "The image file is empty." }, 400);
  }
  if (imageFile.size > MAX_IMAGE_BYTES) {
    return noStore(
      {
        success: false,
        error: "Image is larger than 8 MB. Compress it and try again.",
      },
      413,
    );
  }

  const autoCutoutRaw = textField(form, "autoCutout").toLowerCase();
  const autoCutout =
    assetRole !== "logo" && (autoCutoutRaw === "true" || autoCutoutRaw === "1");

  const sourceUrl = textField(form, "sourceUrl");
  if (sourceUrl && !isHttpUrl(sourceUrl)) {
    return noStore(
      { success: false, error: "sourceUrl must be a valid http(s) URL." },
      400,
    );
  }

  const benefitClaims = parseLineClaims(textField(form, "benefits"));
  const usageClaims = parseLineClaims(textField(form, "usage"));
  if ((benefitClaims.length > 0 || usageClaims.length > 0) && !sourceUrl) {
    return noStore(
      {
        success: false,
        error:
          "أضف رابط المصدر قبل حفظ ادعاءات الفوائد أو الاستخدام. لا تُحفظ ادعاءات غير موثّقة.",
      },
      400,
    );
  }

  try {
    const sourceBytes = new Uint8Array(await imageFile.arrayBuffer());
    let product = productId ? await loadProduct(env, productId, scope.tenantId) : null;
    let autoCreated = false;
    let resolvedSalesLine = salesLine;
    if (!product) {
      if (!autoCreate) {
        return noStore({ success: false, error: "Product not found." }, 404);
      }
      const t = scope as { tenant?: { locked_industry?: string|null; brand?: { industry?: string|null; brandName?: string|null }; locked_brand_name?: string|null } }; const tenantIndustry = t.tenant?.locked_industry ?? t.tenant?.brand?.industry ?? null;
      const created = await autoCreateProductFromImage(env, {
        tenantId: scope.tenantId,
        tenantBrandName: t.tenant?.brand?.brandName ?? t.tenant?.locked_brand_name ?? null,
        tenantIndustry,
        fileName: imageFile.name,
        bytes: sourceBytes,
        mime,
        salesLine,
        skipVision: assetRole === "logo",
      });
      product = await loadProduct(env, created.productId, scope.tenantId);
      autoCreated = true;
      resolvedSalesLine = created.salesLine;
      if (!product) {
        return noStore({ success: false, error: "Failed to create product." }, 500);
      }
    } else if (salesLine) {
      // Operator-supplied phrase for an existing product: store it in the
      // existing `description` column. Never inject unverified claims here.
      await env.DB.prepare(
        `UPDATE products SET description = ?, updated_at = ? WHERE id = ? ${
          scope.tenantId ? "AND tenant_key_id = ?" : ""
        }`,
      )
        .bind(
          salesLine,
          Date.now(),
          product.id,
          ...(scope.tenantId ? [scope.tenantId] : []),
        )
        .run();
    }

    const stored = await storeProductAsset(env, {
      origin: new URL(request.url).origin,
      product,
      tenantKeyId: scope.tenantId,
      sourceBytes,
      sourceMime: mime,
      autoCutout,
      sourceUrl,
      sourceName: textField(form, "sourceName"),
      benefitClaims,
      usageClaims,
    });

    if (!stored.ok) {
      return noStore({ success: false, error: stored.error }, stored.status);
    }

    const asset = stored.asset;

    return noStore({
      success: true,
      autoCreated,
      assetRole,
      salesLine: resolvedSalesLine || null,
      product: {
        id: product.id,
        name_arabic: product.name_arabic,
        brand_arabic: product.brand_arabic,
        brand_slug: product.brand_slug,
        verification_status: "verified",
      },
      asset: {
        id: asset.assetId,
        is_primary: 1,
        image_type: "reference",
        verification_status: "verified",
        storage: asset.storage,
        storage_key: asset.storageKey,
        url: asset.publicUrl,
        usable_url: asset.publicUrl ?? asset.imageUrl,
        data_url: asset.storage === "embedded" ? asset.imageUrl : null,
        content_type: asset.contentType,
        bytes: asset.bytes,
      },
      cutout: {
        requested: autoCutout,
        applied: asset.cutoutApplied,
        note: asset.cutoutNote,
      },
      claims: {
        benefits: benefitClaims.length,
        usage: usageClaims.length,
        inserted: asset.claimsInserted,
        skipped: asset.claimsSkipped,
      },
      message: asset.cutoutApplied
        ? `تم توثيق ${product.name_arabic} بقصّة خلفية شفافة.`
        : `تم توثيق ${product.name_arabic} بالصورة الأصلية.`,
    });
  } catch (error) {
    console.error("Failed to store an uploaded product asset.", error);
    return noStore(
      { success: false, error: "Unable to store the product image in D1." },
      500,
    );
  }
};


type AutoCreateInput = {
  tenantId: string | null;
  tenantBrandName: string | null;
  tenantIndustry: string | null;
  fileName: string;
  bytes: Uint8Array;
  mime: string;
  salesLine: string;
  skipVision?: boolean;
};

async function autoCreateProductFromImage(
  env: AssetStoreEnv,
  input: AutoCreateInput,
): Promise<{ productId: string; salesLine: string }> {
  const now = Date.now();
  let bin = "";
  for (let i = 0; i < input.bytes.length; i++) bin += String.fromCharCode(input.bytes[i]!);
  const base64 = btoa(bin);
  let detectedLabel = "";
  let detectedType = "";
  let visualBrief: Awaited<ReturnType<typeof predictProductFromImage>>["visualBrief"] = null;
  if (!input.skipVision) {
    try {
      const vision = await predictProductFromImage(
        env,
        { bytes: input.bytes, mime: input.mime, base64 },
        input.fileName,
        [],
      );
      detectedLabel = vision.match?.detectedLabel?.trim() || "";
      detectedType = vision.match?.detectedType?.trim() || "";
      visualBrief = vision.visualBrief;
    } catch {
      /* best-effort inference */
    }
  }

  const fileStem = input.fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const inferredName = (detectedLabel || fileStem || "منتج جديد").slice(0, 160);
  const inferredCategory = input.skipVision
    ? "brand_logo"
    : (detectedType || input.tenantIndustry || "عام").slice(0, 80);
  const salesLine = input.skipVision
    ? ""
    : (isSafeSalesLine(input.salesLine) ? sanitizeSalesLine(input.salesLine) : "") ||
      resolveSalesLine({ visualBrief }) ||
      buildStudioSalesLine({
        detectedLabel,
        detectedType,
        tenantIndustry: input.tenantIndustry,
        fileName: input.fileName,
      });

  const brand = await ensureTenantBrand(env, input.tenantId, input.tenantBrandName);
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO products
       (id, brand_id, name_arabic, category, description,
        verification_status, confidence_score, created_at, updated_at, tenant_key_id)
     VALUES (?, ?, ?, ?, ?, 'needs_verification', 0, ?, ?, ?)`,
  )
    .bind(
      id,
      brand.id,
      inferredName,
      inferredCategory,
      salesLine || null,
      now,
      now,
      input.tenantId,
    )
    .run();
  return { productId: id, salesLine };
}

async function ensureTenantBrand(env: AssetStoreEnv, tenantId: string | null, brandName: string | null): Promise<{ id: string }> {
  const now = Date.now();
  const slug = tenantId ? `tenant-${tenantId}` : "default-brand";
  const existing = await env.DB.prepare("SELECT id FROM brands WHERE slug = ? LIMIT 1").bind(slug).first<{ id: string }>();
  if (existing?.id) return existing;
  const any = await env.DB.prepare("SELECT id FROM brands ORDER BY created_at ASC LIMIT 1").first<{ id: string }>();
  if (any?.id && !tenantId) return any;
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO brands (id, name_arabic, slug, identity_status, created_at) VALUES (?, ?, ?, 'needs_verification', ?)"
  ).bind(id, (brandName || "Tenant Brand").slice(0, 120), slug, now).run();
  return { id };
}
