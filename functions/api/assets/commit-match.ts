/**
 * POST /api/assets/commit-match
 *
 * Commits one operator-approved Vision AI match: optional BRIA cutout, R2 or
 * embedded storage, verified primary `product_assets` row, and product
 * verification for the Phase 18 campaign runner.
 *
 * Body: `{ productId, imageDataUrl, autoCutout, sourceUrl?, sourceName?, fileName? }`
 *
 * Provenance: benefit/usage claims are never invented here. When a real source
 * URL is supplied it is stored as a verified source, which is what the quality
 * gate requires before an ad can be approved. Without it the product and image
 * are still verified, but the gate will flag the missing source.
 */

import { parseImageDataUrl } from "./_image";
import { resolveTenantScope } from "../_tenant";
import {
  isHttpUrl,
  loadProduct,
  noStore,
  storeProductAsset,
  type AssetStoreEnv,
} from "./_store";

type CommitEnv = AssetStoreEnv;

function textValue(value: unknown, limit: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, limit);
}

export const onRequestPost: PagesFunction<CommitEnv> = async ({
  request,
  env,
}) => {
  const scope = await resolveTenantScope(request, env);
  if (!scope.ok) return scope.response;

  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
  if (contentType.includes("multipart/form-data")) {
    return noStore(
      {
        success: false,
        error:
          "Use application/json with { productId, imageDataUrl, autoCutout } for committed matches.",
      },
      415,
    );
  }

  let body: Record<string, unknown>;
  try {
    const parsed = (await request.json()) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return noStore({ success: false, error: "Invalid JSON body." }, 400);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return noStore({ success: false, error: "Malformed JSON body." }, 400);
  }

  const productId = textValue(body.productId, 100);
  if (!productId) {
    return noStore({ success: false, error: "Missing productId." }, 400);
  }

  const imageDataUrl =
    typeof body.imageDataUrl === "string" ? body.imageDataUrl : "";
  const image = parseImageDataUrl(imageDataUrl);
  if (!image.ok) {
    return noStore({ success: false, error: image.error }, image.status);
  }

  const autoCutout = body.autoCutout === true || body.autoCutout === "true";

  const sourceUrl = textValue(body.sourceUrl, 500);
  if (sourceUrl && !isHttpUrl(sourceUrl)) {
    return noStore(
      { success: false, error: "sourceUrl must be a valid http(s) URL." },
      400,
    );
  }

  if (Array.isArray(body.benefits) || Array.isArray(body.usage)) {
    return noStore(
      {
        success: false,
        error:
          "لا تُحفظ ادعاءات الفوائد أو الاستخدام من المطابق الذكي. أضفها من قسم التوثيق مع رابط المصدر.",
      },
      400,
    );
  }

  try {
    const product = await loadProduct(env, productId, scope.tenantId);
    if (!product) {
      return noStore({ success: false, error: "Product not found." }, 404);
    }

    const stored = await storeProductAsset(env, {
      origin: new URL(request.url).origin,
      product,
      tenantKeyId: scope.tenantId,
      sourceBytes: image.image.bytes,
      sourceMime: image.image.mime,
      autoCutout,
      sourceUrl,
      sourceName: textValue(body.sourceName, 200),
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
      provenance: {
        source_url: sourceUrl || null,
        quality_gate_ready: Boolean(sourceUrl),
      },
      message: asset.cutoutApplied
        ? `تم اعتماد ${product.name_arabic} بقصّة خلفية شفافة.`
        : `تم اعتماد ${product.name_arabic} بالصورة الأصلية.`,
    });
  } catch (error) {
    console.error("Failed to commit a vision-matched product asset.", error);
    return noStore(
      { success: false, error: "Unable to store the product image in D1." },
      500,
    );
  }
};
