import { z } from "zod";

/**
 * POST /api/db/research/ingest
 *
 * Records verified product research for one product:
 * - one verified information source,
 * - zero or more verified benefit/usage claims,
 * - one verified primary reference packshot,
 * - an optional warehouse stock check.
 *
 * It never rewrites existing rows destructively: sources are reused by
 * `(product_id, source_url)`, claims are de-duplicated, assets are reused by
 * `image_url`, and previous primary assets are demoted instead of deleted.
 */

interface Env {
  DB: D1Database;
}

interface IngestProductRow {
  id: string;
  name_arabic: string;
}

interface IngestResultRow {
  id: string;
  name_arabic: string;
  verification_status: string;
  confidence_score: number;
  warehouse_stock_status: string | null;
}

interface ExistingClaimRow {
  claim_type: string;
  claim_text: string;
}

const httpUrl = z
  .string()
  .trim()
  .min(1)
  .max(1000)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:";
    } catch {
      return false;
    }
  }, "Must be a valid http(s) URL.");

const claimSchema = z
  .object({
    claim_type: z.enum(["benefit", "usage"]),
    claim_text: z.string().trim().min(3).max(300),
  })
  .strict();

const ingestSchema = z
  .object({
    product_id: z.string().trim().min(1).max(100),
    source_name: z.string().trim().min(1).max(200),
    source_url: httpUrl,
    source_type: z.enum(["manufacturer", "regulator", "retailer", "other"]),
    image_url: httpUrl,
    verified_claims: z.array(claimSchema).max(30),
    warehouse_stock_status: z
      .enum(["in_stock", "out_of_stock", "unknown"])
      .optional(),
  })
  .strict();

function confidenceScore(claimCount: number): number {
  const base = 0.8;
  const claimBonus = Math.min(0.2, claimCount * 0.05);
  return Math.round((base + claimBonus) * 100) / 100;
}

function claimKey(claimType: string, claimText: string): string {
  return `${claimType}::${claimText.trim().toLowerCase()}`;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = ingestSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      {
        success: false,
        error: "Invalid research payload.",
        detail: parsed.error.issues
          .map(
            (issue) =>
              `${issue.path.join(".") || "payload"}: ${issue.message}`,
          )
          .join("; "),
      },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const now = Date.now();

  try {
    const product = await env.DB.prepare(
      "SELECT id, name_arabic FROM products WHERE id = ?",
    )
      .bind(data.product_id)
      .first<IngestProductRow>();

    if (!product) {
      return Response.json(
        { success: false, error: "Product not found." },
        { status: 404 },
      );
    }

    const existingSource = await env.DB.prepare(
      `SELECT id FROM product_information_sources
       WHERE product_id = ? AND source_url = ?`,
    )
      .bind(data.product_id, data.source_url)
      .first<{ id: string }>();

    const [existingAsset, existingClaims] = await Promise.all([
      env.DB.prepare(
        `SELECT id FROM product_assets
         WHERE product_id = ? AND image_url = ?`,
      )
        .bind(data.product_id, data.image_url)
        .first<{ id: string }>(),
      env.DB.prepare(
        `SELECT claim_type, claim_text FROM product_research_claims
         WHERE product_id = ? AND source_id = ?`,
      )
        .bind(data.product_id, existingSource?.id ?? "")
        .all<ExistingClaimRow>(),
    ]);

    const sourceId = existingSource?.id ?? crypto.randomUUID();
    const assetId = existingAsset?.id ?? crypto.randomUUID();
    const statements: D1PreparedStatement[] = [];

    if (existingSource) {
      statements.push(
        env.DB.prepare(
          `UPDATE product_information_sources
           SET source_name = ?, source_type = ?, verification_status = 'verified',
               retrieved_at = ?, notes = NULL
           WHERE id = ? AND product_id = ?`,
        ).bind(
          data.source_name,
          data.source_type,
          now,
          sourceId,
          data.product_id,
        ),
      );
    } else {
      statements.push(
        env.DB.prepare(
          `INSERT INTO product_information_sources
             (id, product_id, source_url, source_name, source_type,
              verification_status, retrieved_at, notes, created_at)
           VALUES (?, ?, ?, ?, ?, 'verified', ?, NULL, ?)`,
        ).bind(
          sourceId,
          data.product_id,
          data.source_url,
          data.source_name,
          data.source_type,
          now,
          now,
        ),
      );
    }

    const seenClaims = new Set(
      existingClaims.results.map((claim) =>
        claimKey(claim.claim_type, claim.claim_text),
      ),
    );
    const newClaims: { claim_type: "benefit" | "usage"; claim_text: string }[] =
      [];

    for (const claim of data.verified_claims) {
      const key = claimKey(claim.claim_type, claim.claim_text);
      if (seenClaims.has(key)) continue;
      seenClaims.add(key);
      newClaims.push(claim);
      statements.push(
        env.DB.prepare(
          `INSERT INTO product_research_claims
             (id, product_id, source_id, claim_type, claim_text,
              verification_status, verified_at, notes, created_at)
           VALUES (?, ?, ?, ?, ?, 'verified', ?, NULL, ?)`,
        ).bind(
          crypto.randomUUID(),
          data.product_id,
          sourceId,
          claim.claim_type,
          claim.claim_text,
          now,
          now,
        ),
      );
    }

    // Exactly one primary reference image per product.
    statements.push(
      env.DB.prepare(
        `UPDATE product_assets SET is_primary = 0
         WHERE product_id = ? AND is_primary = 1 AND id != ?`,
      ).bind(data.product_id, assetId),
    );

    if (existingAsset) {
      statements.push(
        env.DB.prepare(
          `UPDATE product_assets
           SET image_url = ?, source_url = ?, image_type = 'reference',
               verification_status = 'verified', is_primary = 1,
               retrieved_at = ?
           WHERE id = ? AND product_id = ?`,
        ).bind(
          data.image_url,
          data.source_url,
          now,
          assetId,
          data.product_id,
        ),
      );
    } else {
      statements.push(
        env.DB.prepare(
          `INSERT INTO product_assets
             (id, product_id, image_url, source_url, storage_key, image_type,
              verification_status, is_primary, retrieved_at)
           VALUES (?, ?, ?, ?, NULL, 'reference', 'verified', 1, ?)`,
        ).bind(assetId, data.product_id, data.image_url, data.source_url, now),
      );
    }

    const stockStatus = data.warehouse_stock_status;
    const stockTracked =
      stockStatus === "in_stock" || stockStatus === "out_of_stock";
    if (stockTracked) {
      statements.push(
        env.DB.prepare(
          `INSERT INTO warehouse_stock_checks
             (id, product_id, stock_status, checked_at, checked_by, notes)
           VALUES (?, ?, ?, ?, 'dashboard-ingest', NULL)`,
        ).bind(crypto.randomUUID(), data.product_id, stockStatus, now),
      );
    }

    const score = confidenceScore(
      seenClaims.size > 0 ? seenClaims.size : newClaims.length,
    );

    statements.push(
      env.DB.prepare(
        `UPDATE products
         SET verification_status = 'verified',
             confidence_score = ?,
             last_researched_at = ?,
             updated_at = ?,
             warehouse_stock_status = COALESCE(?, warehouse_stock_status)
         WHERE id = ?`,
      ).bind(
        score,
        now,
        now,
        stockTracked ? stockStatus : null,
        data.product_id,
      ),
    );

    await env.DB.batch(statements);

    const updated = await env.DB.prepare(
      `SELECT id, name_arabic, verification_status, confidence_score,
              warehouse_stock_status
       FROM products WHERE id = ?`,
    )
      .bind(data.product_id)
      .first<IngestResultRow>();

    return Response.json({
      success: true,
      product: updated ?? {
        id: product.id,
        name_arabic: product.name_arabic,
        verification_status: "verified",
        confidence_score: score,
        warehouse_stock_status: data.warehouse_stock_status ?? null,
      },
      source: {
        id: sourceId,
        source_url: data.source_url,
        source_name: data.source_name,
        source_type: data.source_type,
        verification_status: "verified",
        reused: Boolean(existingSource),
      },
      asset: {
        id: assetId,
        image_url: data.image_url,
        verification_status: "verified",
        is_primary: 1,
        reused: Boolean(existingAsset),
      },
      claims: {
        received: data.verified_claims.length,
        inserted: newClaims.length,
        skipped: data.verified_claims.length - newClaims.length,
      },
      warehouseStockCheckRecorded: stockTracked,
    });
  } catch (error) {
    console.error("Failed to ingest product research into D1.", error);
    return Response.json(
      { success: false, error: "Unable to save product research to D1." },
      { status: 500 },
    );
  }
};
