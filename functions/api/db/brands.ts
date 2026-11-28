interface Env {
  DB: D1Database;
  REQUIRE_ACCESS_KEY?: string;
}

interface BrandRow {
  id: string;
  name_arabic: string;
  name_english: string | null;
  slug: string;
  identity_status: string;
  product_count: number;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const { resolveTenantScope } = await import("../_tenant");
  const scope = await resolveTenantScope(request, env);
  if (!scope.ok) return scope.response;

  try {
    const tenant = scope.tenantId;
    const { results } = tenant
      ? await env.DB.prepare(`
          SELECT b.id, b.name_arabic, b.name_english, b.slug, b.identity_status,
                 COUNT(p.id) AS product_count
          FROM brands b
          JOIN products p ON p.brand_id = b.id AND p.tenant_key_id = ?
          WHERE EXISTS (
            SELECT 1 FROM products scoped
            WHERE scoped.brand_id = b.id AND scoped.tenant_key_id = ?
          )
          GROUP BY b.id
          ORDER BY b.name_arabic
        `).bind(tenant, tenant).all<BrandRow>()
      : await env.DB.prepare(`
          SELECT b.id, b.name_arabic, b.name_english, b.slug, b.identity_status,
                 COUNT(p.id) AS product_count
          FROM brands b
          LEFT JOIN products p ON p.brand_id = b.id
          GROUP BY b.id
          ORDER BY b.name_arabic
        `).all<BrandRow>();

    return Response.json({ success: true, brands: results });
  } catch (error) {
    console.error("Failed to load Al Rahma brands from D1.", error);
    return Response.json(
      { success: false, error: "Unable to load brands from D1." },
      { status: 500 },
    );
  }
};
