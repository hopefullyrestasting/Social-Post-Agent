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
import {
  isHttpUrl,
  loadProduct,
  noStore,
  parseLineClaims,
  storeProductAsset,
  type AssetStoreEnv,
} from "./_store";

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
  if (!productId || productId.length > 100) {
    return noStore({ success: false, error: "Missing productId." }, 400);
  }

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
  const autoCutout = autoCutoutRaw === "true" || autoCutoutRaw === "1";

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
    const product = await loadProduct(env, productId);
    if (!product) {
      return noStore({ success: false, error: "Product not found." }, 404);
    }

    const stored = await storeProductAsset(env, {
      origin: new URL(request.url).origin,
      product,
      sourceBytes: new Uint8Array(await imageFile.arrayBuffer()),
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
