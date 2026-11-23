import { z } from "zod";
import { resolveTenantScope } from "../../_tenant";
import {
  ingestSchema,
  saveResearchRecord,
  type Env,
  type IngestPayload,
} from "./ingest";

/**
 * POST /api/db/research/bulk-ingest
 *
 * Batch version of `/ingest` for rapidly populating the 177 existing products.
 * Accepts 1–50 records (either a bare array or `{ "records": [...] }`).
 *
 * Validation is all-or-nothing so a malformed batch never writes partially:
 * - every record must match the single-record schema,
 * - every product must exist,
 * - all products in one batch must share the same category.
 *
 * Processing reuses `saveResearchRecord`, so re-running a batch is idempotent
 * (sources reused, claims de-duplicated, primary assets demoted not deleted).
 */

interface ProductCategoryRow {
  id: string;
  category: string | null;
}

const recordsSchema = z.array(ingestSchema).min(1).max(50);
const bulkSchema = z.union([
  recordsSchema,
  z.object({ records: recordsSchema }).strict(),
]);

function extractRecords(payload: unknown): IngestPayload[] | null {
  const parsed = bulkSchema.safeParse(payload);
  if (!parsed.success) return null;
  return Array.isArray(parsed.data) ? parsed.data : parsed.data.records;
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

  const records = extractRecords(payload);
  if (!records) {
    return Response.json(
      {
        success: false,
        error: "Invalid bulk payload.",
        detail:
          "Send an array of 1–50 records matching POST /api/db/research/ingest.",
      },
      { status: 400 },
    );
  }

  const scope = await resolveTenantScope(request, env);
  if (!scope.ok) return scope.response;

  const productIds = Array.from(
    new Set(records.map((record) => record.product_id)),
  );

  try {
    const placeholders = productIds.map(() => "?").join(",");
    const tenantFilter = scope.tenantId ? " AND tenant_key_id = ?" : "";
    const products = await env.DB.prepare(
      `SELECT id, category FROM products WHERE id IN (${placeholders})${tenantFilter}`,
    )
      .bind(...productIds, ...(scope.tenantId ? [scope.tenantId] : []))
      .all<ProductCategoryRow>();

    const found = new Map(
      products.results.map((row) => [row.id, row.category] as const),
    );
    const missing = productIds.filter((id) => !found.has(id));
    if (missing.length > 0) {
      return Response.json(
        {
          success: false,
          error: "One or more products were not found.",
          missing,
        },
        { status: 404 },
      );
    }

    const categories = new Set(
      productIds.map((id) => (found.get(id) ?? "").trim()),
    );
    if (categories.size > 1) {
      return Response.json(
        {
          success: false,
          error:
            "All products in a bulk import must share the same category.",
          categories: Array.from(categories),
        },
        { status: 400 },
      );
    }

    const category = Array.from(categories)[0] || null;
    const results: {
      product_id: string;
      ok: boolean;
      claims?: { inserted: number; skipped: number };
      error?: string;
    }[] = [];

    const now = Date.now();
    for (const record of records) {
      try {
        const saved = await saveResearchRecord(env, record, now, scope.tenantId);
        results.push(
          saved.ok
            ? {
                product_id: record.product_id,
                ok: true,
                claims: {
                  inserted: saved.data.claims.inserted,
                  skipped: saved.data.claims.skipped,
                },
              }
            : {
                product_id: record.product_id,
                ok: false,
                error: saved.error,
              },
        );
      } catch (error) {
        console.error(
          `Bulk ingest failed for product ${record.product_id}.`,
          error,
        );
        results.push({
          product_id: record.product_id,
          ok: false,
          error: "Unable to save this record.",
        });
      }
    }

    const failed = results.filter((result) => !result.ok).length;

    return Response.json(
      {
        success: failed === 0,
        total: records.length,
        processed: records.length - failed,
        failed,
        category,
        results,
      },
      { status: failed === 0 ? 200 : 500 },
    );
  } catch (error) {
    console.error("Failed to bulk ingest product research into D1.", error);
    return Response.json(
      { success: false, error: "Unable to bulk ingest product research." },
      { status: 500 },
    );
  }
};
