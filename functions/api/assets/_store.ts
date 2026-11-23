/**
 * Shared packshot storage + verification pipeline.
 *
 * Used by:
 *   - `POST /api/assets/upload`      (manual per-product and bulk filename upload)
 *   - `POST /api/assets/commit-match` (Vision AI reviewed matches)
 *
 * Keeping one pipeline means the campaign runner sees exactly the same D1 shape
 * no matter which dashboard flow produced the image:
 *   - `product_assets` row: image_type='reference', is_primary=1, verified
 *   - the previous primary asset is demoted (never deleted)
 *   - `products.verification_status='verified'` with a confidence score
 *
 * Storage strategy:
 *   1. Cloudflare R2 when the optional `PRODUCT_ASSETS` bucket is bound; the
 *      image is served by `/api/assets/file`.
 *   2. Otherwise an optimized embedded data URI, so uploads work before the
 *      bucket exists.
 *
 * Provenance rule: benefit/usage claims are only stored when the operator
 * supplies a real source URL. Nothing is invented to satisfy the quality gate.
 */

import {
  base64FromBytes,
  extensionForMime,
  parseImageDataUrl,
} from "./_image";
import { removePackshotBackgroundFromBytes } from "../ai/remove-bg";

export interface AiBinding {
  run: (model: string, input: Record<string, unknown>) => Promise<unknown>;
}

export interface AssetBucket {
  put: (
    key: string,
    value: ArrayBuffer | ArrayBufferView,
    options?: { httpMetadata?: { contentType?: string } },
  ) => Promise<unknown>;
}

export interface AssetStoreEnv {
  DB: D1Database;
  AI?: AiBinding;
  REMOVE_BG_API_KEY?: string;
  PRODUCT_ASSETS?: AssetBucket;
  REQUIRE_ACCESS_KEY?: string;
}

export interface StoredProduct {
  id: string;
  name_arabic: string;
  verification_status: string;
  brand_arabic: string;
  brand_slug: string;
}

export interface ExistingSourceRow {
  id: string;
}

export interface ExistingClaimRow {
  claim_type: string;
  claim_text: string;
}

export const MAX_EMBEDDED_CHARS = 700_000;
const MAX_CLAIMS = 12;
const CLAIM_MAX_LENGTH = 240;

export function noStore(
  data: Record<string, unknown>,
  status = 200,
): Response {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" },
  });
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function parseLineClaims(value: string): string[] {
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

function claimKey(claimType: string, claimText: string): string {
  return `${claimType}::${claimText.trim().toLowerCase()}`;
}

function confidenceFor(claimCount: number, cutoutApplied: boolean): number {
  const base = cutoutApplied ? 0.88 : 0.84;
  return Math.round(Math.min(0.97, base + claimCount * 0.02) * 100) / 100;
}

/** Loads one product with its brand, or null when the id does not exist. */
export async function loadProduct(
  env: AssetStoreEnv,
  productId: string,
  tenantId: string | null = null,
): Promise<StoredProduct | null> {
  const tenantClause = tenantId ? "AND p.tenant_key_id = ?" : "";
  const binds = tenantId ? [productId, tenantId] : [productId];
  return env.DB.prepare(
    `SELECT p.id, p.name_arabic, p.verification_status,
            b.name_arabic AS brand_arabic, b.slug AS brand_slug
     FROM products p
     JOIN brands b ON b.id = p.brand_id
     WHERE p.id = ? ${tenantClause}`,
  )
    .bind(...binds)
    .first<StoredProduct>();
}

export interface StoredAsset {
  assetId: string;
  storage: "r2" | "embedded";
  storageKey: string | null;
  imageUrl: string;
  publicUrl: string | null;
  contentType: string;
  bytes: number;
  cutoutApplied: boolean;
  cutoutNote: string | null;
  claimsInserted: number;
  claimsSkipped: number;
  confidence: number;
}

export type StoreAssetResult =
  | { ok: true; asset: StoredAsset }
  | { ok: false; status: number; error: string };

export interface StoreAssetInput {
  /** Request origin, used to build the public `/api/assets/file` URL. */
  origin: string;
  product: StoredProduct;
  tenantKeyId?: string | null;
  sourceBytes: Uint8Array;
  sourceMime: string;
  autoCutout: boolean;
  sourceUrl?: string;
  sourceName?: string;
  benefitClaims?: string[];
  usageClaims?: string[];
}

/**
 * Cuts out (optional), stores, and verifies one packshot for one product.
 * Every D1 write is additive; nothing is deleted or truncated.
 */
export async function storeProductAsset(
  env: AssetStoreEnv,
  input: StoreAssetInput,
): Promise<StoreAssetResult> {
  const { product, sourceBytes, sourceMime } = input;
  const sourceUrl = (input.sourceUrl ?? "").trim();
  const benefitClaims = input.benefitClaims ?? [];
  const usageClaims = input.usageClaims ?? [];

  let outputBytes: Uint8Array = sourceBytes;
  let outputMime = sourceMime;
  let cutoutApplied = false;
  let cutoutNote: string | null = null;

  if (input.autoCutout) {
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
    const safeProductId = product.id.replace(/[^A-Za-z0-9._-]/g, "_");
    storageKey = `products/${safeProductId}/${assetId}.${extensionForMime(outputMime)}`;
    await bucket.put(storageKey, outputBytes, {
      httpMetadata: { contentType: outputMime },
    });
    imageUrl = `${input.origin}/api/assets/file?key=${encodeURIComponent(
      storageKey,
    )}${cutoutApplied ? "&cutout=1" : ""}`;
    publicUrl = imageUrl;
    storage = "r2";
  } else {
    let embedded = `data:${outputMime};base64,${base64FromBytes(outputBytes)}`;
    if (embedded.length > MAX_EMBEDDED_CHARS && cutoutApplied) {
      // A transparent PNG can outgrow the embed budget: keep the original
      // photo rather than losing the upload.
      outputBytes = sourceBytes;
      outputMime = sourceMime;
      cutoutApplied = false;
      cutoutNote =
        "القص التلقائي كبّر الصورة عن الحد المسموح؛ تم حفظ الصورة الأصلية. اربط حاوية R2 لحفظ قصّات كبيرة.";
      embedded = `data:${outputMime};base64,${base64FromBytes(outputBytes)}`;
    }
    if (embedded.length > MAX_EMBEDDED_CHARS) {
      return {
        ok: false,
        status: 413,
        error:
          "الصورة كبيرة على التخزين المدمج (بدون R2). اربط حاوية R2 باسم PRODUCT_ASSETS أو ارفع صورة أصغر.",
      };
    }
    imageUrl = embedded;
    storage = "embedded";
  }

  const now = Date.now();
  const statements: D1PreparedStatement[] = [];

  // Never delete: demote whatever was primary before this upload.
  const tenantKeyId = input.tenantKeyId ?? null;
  const tenantClauseDemote = tenantKeyId ? " AND tenant_key_id = ?" : "";
  statements.push(
    env.DB.prepare(
      `UPDATE product_assets SET is_primary = 0
       WHERE product_id = ? AND is_primary = 1 AND id != ?${tenantClauseDemote}`,
    ).bind(...[product.id, assetId, ...(tenantKeyId ? [tenantKeyId] : [])]),
  );

  statements.push(
    env.DB.prepare(
      `INSERT INTO product_assets
         (id, product_id, image_url, source_url, storage_key, image_type,
          verification_status, is_primary, retrieved_at, tenant_key_id)
       VALUES (?, ?, ?, ?, ?, 'reference', 'verified', 1, ?, ?)`,
    ).bind(
      assetId,
      product.id,
      imageUrl,
      sourceUrl || null,
      storageKey,
      now,
      tenantKeyId,
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
      .bind(product.id, sourceUrl)
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
          (input.sourceName ?? "").trim() || "صورة المنتج الأصلية",
          now,
          sourceId,
          product.id,
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
          product.id,
          sourceUrl,
          (input.sourceName ?? "").trim() || "صورة المنتج الأصلية",
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
        .bind(product.id, sourceId)
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
            product.id,
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
       WHERE id = ?${tenantKeyId ? " AND tenant_key_id = ?" : ""}`,
    ).bind(
      confidenceFor(claimsInserted, cutoutApplied),
      now,
      now,
      product.id,
      ...(tenantKeyId ? [tenantKeyId] : []),
    ),
  );

  await env.DB.batch(statements);

  return {
    ok: true,
    asset: {
      assetId,
      storage,
      storageKey,
      imageUrl,
      publicUrl,
      contentType: outputMime,
      bytes: outputBytes.length,
      cutoutApplied,
      cutoutNote,
      claimsInserted,
      claimsSkipped,
      confidence: confidenceFor(claimsInserted, cutoutApplied),
    },
  };
}
