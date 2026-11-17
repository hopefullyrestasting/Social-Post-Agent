/**
 * POST /api/assets/upload
 *
 * Dashboard upload for real product packshots. One request binds one photo to
 * one D1 product and publishes it as that product's primary verified reference
 * image, so the Phase 18 campaign runner picks it up on the next run.
 *
 * Storage strategy:
 *   1. Cloudflare R2 when the optional `PRODUCT_ASSETS` bucket is bound (the
 *      image is served by `/api/assets/file`).
 *   2. Otherwise an optimized embedded data URI, so the feature works before
 *      the bucket exists.
 *
 * D1 notes:
 *   - This repository's canonical image table is `product_assets` (the baseline
 *     schema has no `product_images`), so uploads land where `/api/db/stats`,
 *     `/api/db/products` and `campaigns/run` already read them.
 *   - Writes are additive: previous primary assets are demoted, never deleted.
 *   - Benefit/usage claims are only stored when the operator supplies a source
 *     URL, because unverified marketing claims are forbidden.
 */

import {
  base64FromBytes,
  extensionForMime,
  normalizeImageMime,
  parseImageDataUrl,
  MAX_IMAGE_BYTES,
} from "./_image";
import { removePackshotBackgroundFromBytes } from "../ai/remove-bg";

interface AiBinding {
  run: (model: string, input: Record<string, unknown>) => Promise<unknown>;
}

interface AssetBucket {
  put: (
    key: string,
    value: ArrayBuffer | ArrayBufferView,
    options?: { httpMetadata?: { contentType?: string } },
  ) => Promise<unknown>;
}

export interface UploadEnv {
  DB: D1Database;
  AI?: AiBinding;
  REMOVE_BG_API_KEY?: string;
  PRODUCT_ASSETS?: AssetBucket;
}

const MAX_EMBEDDED_CHARS = 700_000;
const MAX_CLAIMS = 12;
const CLAIM_MAX_LENGTH = 240;

const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  avif: "image/avif",
};

interface ProductRow {
  id: string;
  name_arabic: string;
  verification_status: string;
  brand_arabic: string;
  brand_slug: string;
}

interface ExistingSourceRow {
  id: string;
}

interface ExistingClaimRow {
  claim_type: string;
  claim_text: string;
}

function noStore(data: Record<string, unknown>, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" },
  });
}

function mimeFromFileName(fileName: string): string | null {
  const extension = fileName.split(".").pop()?.trim().toLowerCase() ?? "";
  return normalizeImageMime(MIME_BY_EXTENSION[extension] ?? null);
}

function textField(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function parseLineClaims(value: string): string[] {
  if (!value) return [];
  const seen = new Set<string>();
  const claims: string[] = [];
  for (const raw of value.split(/[\n,]+/)) {
    const claim = raw.trim().replace(/\s+/g, " ");
    if (claim.length < 3 || claim.length > CLAIM_MAX_LENGTH) continue;
    const key = claim.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    claims.push(claim);
    if (claims.length >= MAX_CLAIMS) break;
  }
  return claims;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function claimKey(claimType: string, claimText: string): string {
  return `${claimType}::${claimText.trim().toLowerCase()}`;
}

function confidenceFor(claimCount: number, cutoutApplied: boolean): number {
  const base = cutoutApplied ? 0.88 : 0.84;
  return Math.round(Math.min(0.97, base + claimCount * 0.02) * 100) / 100;
}

function fileFromForm(form: FormData): File | null {
  const candidate = form.get("imageFile") ?? form.get("file") ?? form.get("image");
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
    return noStore(
      { success: false, error: "Malformed multipart body." },
      400,
    );
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
    const product = await env.DB.prepare(
      `SELECT p.id, p.name_arabic, p.verification_status,
              b.name_arabic AS brand_arabic, b.slug AS brand_slug
       FROM products p
       JOIN brands b ON b.id = p.brand_id
       WHERE p.id = ?`,
    )
      .bind(productId)
      .first<ProductRow>();

    if (!product) {
      return noStore({ success: false, error: "Product not found." }, 404);
    }

    const sourceBytes = new Uint8Array(await imageFile.arrayBuffer());

    let outputBytes: Uint8Array = sourceBytes;
    let outputMime = mime;
    let cutoutApplied = false;
    let cutoutNote: string | null = null;

    if (autoCutout) {
      const cutout = await removePackshotBackgroundFromBytes(
        { AI: env.AI, REMOVE_BG_API_KEY: env.REMOVE_BG_API_KEY },
        sourceBytes,
      );
      if (cutout) {
        const parsed = parseImageDataUrl(cutout);
        if (parsed.ok) {
          outputBytes = parsed.image.bytes;
          outputMime = "image/png";
          cutoutApplied = true;
        }
      }
      if (!cutoutApplied) {
        cutoutNote = "تعذر قص الخلفية تلقائياً؛ تم حفظ الصورة الأصلية كما هي.";
      }
    }

    const assetId = crypto.randomUUID();
    const bucket = env.PRODUCT_ASSETS;
    let storage: "r2" | "embedded";
    let storageKey: string | null = null;
    let imageUrl: string;
    let publicUrl: string | null = null;

    if (bucket) {
      const safeProductId = productId.replace(/[^A-Za-z0-9._-]/g, "_");
      storageKey = `products/${safeProductId}/${assetId}.${extensionForMime(outputMime)}`;
      await bucket.put(storageKey, outputBytes, {
        httpMetadata: { contentType: outputMime },
      });
      const origin = new URL(request.url).origin;
      imageUrl = `${origin}/api/assets/file?key=${encodeURIComponent(storageKey)}${
        cutoutApplied ? "&cutout=1" : ""
      }`;
      publicUrl = imageUrl;
      storage = "r2";
    } else {
      let embedded = `data:${outputMime};base64,${base64FromBytes(outputBytes)}`;
      if (embedded.length > MAX_EMBEDDED_CHARS && cutoutApplied) {
        // A transparent PNG can outgrow the embed budget: keep the original
        // photo rather than losing the upload.
        outputBytes = sourceBytes;
        outputMime = mime;
        cutoutApplied = false;
        cutoutNote =
          "القص التلقائي كبّر الصورة عن الحد المسموح؛ تم حفظ الصورة الأصلية. اربط حاوية R2 لحفظ قصّات كبيرة.";
        embedded = `data:${outputMime};base64,${base64FromBytes(outputBytes)}`;
      }
      if (embedded.length > MAX_EMBEDDED_CHARS) {
        return noStore(
          {
            success: false,
            error:
              "الصورة كبيرة على التخزين المدمج (بدون R2). اربط حاوية R2 باسم PRODUCT_ASSETS أو ارفع صورة أصغر.",
          },
          413,
        );
      }
      imageUrl = embedded;
      storage = "embedded";
    }

    const now = Date.now();
    const statements: D1PreparedStatement[] = [];

    // Never delete: demote whatever was primary before this upload.
    statements.push(
      env.DB.prepare(
        `UPDATE product_assets SET is_primary = 0
         WHERE product_id = ? AND is_primary = 1 AND id != ?`,
      ).bind(productId, assetId),
    );

    statements.push(
      env.DB.prepare(
        `INSERT INTO product_assets
           (id, product_id, image_url, source_url, storage_key, image_type,
            verification_status, is_primary, retrieved_at)
         VALUES (?, ?, ?, ?, ?, 'reference', 'verified', 1, ?)`,
      ).bind(
        assetId,
        productId,
        imageUrl,
        sourceUrl || null,
        storageKey,
        now,
      ),
    );

    let claimsInserted = 0;
    let claimsSkipped = 0;

    // A source URL is recorded as verified provenance even without claims, so
    // the quality gate can approve creatives made from this upload. Claims are
    // only stored when the operator supplied them next to that source.
    if (sourceUrl) {
      const existingSource = await env.DB.prepare(
        `SELECT id FROM product_information_sources
         WHERE product_id = ? AND source_url = ?`,
      )
        .bind(productId, sourceUrl)
        .first<ExistingSourceRow>();

      const sourceId = existingSource?.id ?? crypto.randomUUID();

      if (existingSource) {
        statements.push(
          env.DB.prepare(
            `UPDATE product_information_sources
             SET source_name = ?, source_type = 'other',
                 verification_status = 'verified', retrieved_at = ?
             WHERE id = ? AND product_id = ?`,
          ).bind(
            textField(form, "sourceName") || "صورة المنتج الأصلية",
            now,
            sourceId,
            productId,
          ),
        );
      } else {
        statements.push(
          env.DB.prepare(
            `INSERT INTO product_information_sources
               (id, product_id, source_url, source_name, source_type,
                verification_status, retrieved_at, notes, created_at)
             VALUES (?, ?, ?, ?, 'other', 'verified', ?, ?, ?)`,
          ).bind(
            sourceId,
            productId,
            sourceUrl,
            textField(form, "sourceName") || "صورة المنتج الأصلية",
            now,
            "توثيق يدوي من لوحة إدارة الصور",
            now,
          ),
        );
      }

      if (benefitClaims.length > 0 || usageClaims.length > 0) {
        const existingClaims = await env.DB.prepare(
          `SELECT claim_type, claim_text FROM product_research_claims
           WHERE product_id = ? AND source_id = ?`,
        )
          .bind(productId, sourceId)
          .all<ExistingClaimRow>();

        const seen = new Set(
          existingClaims.results.map((claim) =>
            claimKey(claim.claim_type, claim.claim_text),
          ),
        );

        const pendingClaims: {
          claim_type: "benefit" | "usage";
          claim_text: string;
        }[] = [
          ...benefitClaims.map((claim_text) => ({
            claim_type: "benefit" as const,
            claim_text,
          })),
          ...usageClaims.map((claim_text) => ({
            claim_type: "usage" as const,
            claim_text,
          })),
        ];

        for (const claim of pendingClaims) {
          const key = claimKey(claim.claim_type, claim.claim_text);
          if (seen.has(key)) {
            claimsSkipped += 1;
            continue;
          }
          seen.add(key);
          claimsInserted += 1;
          statements.push(
            env.DB.prepare(
              `INSERT INTO product_research_claims
                 (id, product_id, source_id, claim_type, claim_text,
                  verification_status, verified_at, notes, created_at)
               VALUES (?, ?, ?, ?, ?, 'verified', ?, NULL, ?)`,
            ).bind(
              crypto.randomUUID(),
              productId,
              sourceId,
              claim.claim_type,
              claim.claim_text,
              now,
              now,
            ),
          );
        }
      }
    }

    statements.push(
      env.DB.prepare(
        `UPDATE products
         SET verification_status = 'verified',
             confidence_score = ?,
             last_researched_at = ?,
             updated_at = ?
         WHERE id = ?`,
      ).bind(
        confidenceFor(claimsInserted, cutoutApplied),
        now,
        now,
        productId,
      ),
    );

    await env.DB.batch(statements);

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
        id: assetId,
        is_primary: 1,
        image_type: "reference",
        verification_status: "verified",
        storage,
        storage_key: storageKey,
        url: publicUrl,
        content_type: outputMime,
        bytes: outputBytes.length,
      },
      cutout: {
        requested: autoCutout,
        applied: cutoutApplied,
        note: cutoutNote,
      },
      claims: {
        benefits: benefitClaims.length,
        usage: usageClaims.length,
        inserted: claimsInserted,
        skipped: claimsSkipped,
      },
      message: cutoutApplied
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
