/**
 * GET /api/assets/catalog
 *
 * Compact, read-only product catalog used by the dashboard's Product Asset
 * Manager: enough fields to search, filter, and filename-match uploads without
 * downloading every page of `/api/db/products`.
 */

import { resolveTenantScope } from "../_tenant";

interface Env {
  DB: D1Database;
  REQUIRE_ACCESS_KEY?: string;
}

interface CatalogRow {
  id: string;
  name_arabic: string;
  name_english: string | null;
  category: string | null;
  verification_status: string;
  brand_arabic: string;
  brand_english: string | null;
  brand_slug: string;
}

interface CountRow {
  total: number | null;
  verified: number | null;
}

const CATALOG_LIMIT = 500;

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const scope = await resolveTenantScope(request, env);
  if (!scope.ok) return scope.response;

  try {
    const [rows, counts] = await Promise.all([
      env.DB.prepare(
        `SELECT p.id, p.name_arabic, p.name_english, p.category,
                p.verification_status, b.name_arabic AS brand_arabic,
                b.name_english AS brand_english, b.slug AS brand_slug
         FROM products p
         JOIN brands b ON b.id = p.brand_id
          ${scope.tenantId ? "WHERE p.tenant_key_id = ?" : ""}
         ORDER BY
           CASE WHEN p.verification_status = 'verified' THEN 1 ELSE 0 END,
           b.name_arabic, p.name_arabic, p.id
         LIMIT ?`,
      )
        .bind(...(scope.tenantId ? [scope.tenantId, CATALOG_LIMIT + 1] : [CATALOG_LIMIT + 1]))
        .all<CatalogRow>(),
      env.DB.prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN verification_status = 'verified' THEN 1 ELSE 0 END)
                  AS verified
         FROM products ${scope.tenantId ? "WHERE tenant_key_id = ?" : ""}`,
      ).bind(...(scope.tenantId ? [scope.tenantId] : [])).first<CountRow>(),
    ]);

    const truncated = rows.results.length > CATALOG_LIMIT;
    const products = truncated
      ? rows.results.slice(0, CATALOG_LIMIT)
      : rows.results;
    const total = counts?.total ?? products.length;
    const verified = counts?.verified ?? 0;

    return Response.json(
      {
        success: true,
        products,
        counts: {
          total,
          verified,
          pending: Math.max(0, total - verified),
        },
        truncated,
        limit: CATALOG_LIMIT,
      },
      { headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" } },
    );
  } catch (error) {
    console.error("Failed to load the product asset catalog from D1.", error);
    return Response.json(
      { success: false, error: "Unable to load the product catalog." },
      { status: 500 },
    );
  }
};
