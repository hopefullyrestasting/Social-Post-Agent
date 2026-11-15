interface Env {
  DB: D1Database;
}

interface ProductRow {
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
}

interface CategoryRow {
  category: string;
}

function parseInteger(
  value: string | null,
  fallback: number,
  minimum: number,
  maximum: number,
): number | null {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) return null;

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    return null;
  }

  return parsed;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const limit = parseInteger(url.searchParams.get("limit"), 50, 1, 100);
  const offset = parseInteger(
    url.searchParams.get("offset"),
    0,
    0,
    Number.MAX_SAFE_INTEGER,
  );

  if (limit === null || offset === null) {
    return Response.json(
      { success: false, error: "limit must be 1–100 and offset must be a non-negative integer." },
      { status: 400 },
    );
  }

  const query = (url.searchParams.get("q") || "").trim().slice(0, 100);
  const brand = (url.searchParams.get("brand") || "").trim().slice(0, 100);
  const status = (url.searchParams.get("status") || "").trim().slice(0, 50);
  const category = (url.searchParams.get("category") || "").trim().slice(0, 100);
  const where: string[] = [];
  const values: string[] = [];

  if (query) {
    where.push(
      "(p.name_arabic LIKE ? OR p.name_english LIKE ? OR p.category LIKE ? OR p.subcategory LIKE ? OR p.variant LIKE ?)",
    );
    const pattern = `%${query}%`;
    values.push(pattern, pattern, pattern, pattern, pattern);
  }
  if (brand) {
    where.push("b.slug = ?");
    values.push(brand);
  }
  if (status) {
    where.push("p.verification_status = ?");
    values.push(status);
  }
  if (category) {
    where.push("p.category = ?");
    values.push(category);
  }

  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  try {
    const [count, products, categories] = await Promise.all([
      env.DB.prepare(`
        SELECT COUNT(*) AS count
        FROM products p
        JOIN brands b ON b.id = p.brand_id
        ${clause}
      `)
        .bind(...values)
        .first<{ count: number }>(),
      env.DB.prepare(`
        SELECT p.id, p.name_arabic, p.name_english, p.category, p.subcategory,
               p.packaging_size, p.variant, p.egypt_market_status,
               p.warehouse_stock_status, p.verification_status, p.confidence_score,
               b.name_arabic AS brand_arabic, b.name_english AS brand_english,
               b.slug AS brand_slug,
               (
                 SELECT pa.image_url
                 FROM product_assets pa
                 WHERE pa.product_id = p.id
                   AND pa.image_type = 'reference'
                   AND pa.is_primary = 1
                   AND pa.image_url IS NOT NULL
                   AND TRIM(pa.image_url) != ''
                 ORDER BY pa.retrieved_at DESC
                 LIMIT 1
               ) AS image_url,
               (
                 SELECT pa.source_url
                 FROM product_assets pa
                 WHERE pa.product_id = p.id
                   AND pa.image_type = 'reference'
                   AND pa.is_primary = 1
                   AND pa.image_url IS NOT NULL
                   AND TRIM(pa.image_url) != ''
                 ORDER BY pa.retrieved_at DESC
                 LIMIT 1
               ) AS image_source
        FROM products p
        JOIN brands b ON b.id = p.brand_id
        ${clause}
        ORDER BY b.name_arabic, p.name_arabic, p.id
        LIMIT ? OFFSET ?
      `)
        .bind(...values, limit, offset)
        .all<ProductRow>(),
      env.DB.prepare(`
        SELECT DISTINCT category
        FROM products
        WHERE category IS NOT NULL AND TRIM(category) != ''
        ORDER BY category
      `).all<CategoryRow>(),
    ]);

    return Response.json({
      success: true,
      products: products.results,
      categories: categories.results.map((row) => row.category),
      total: count?.count ?? 0,
      limit,
      offset,
      hasMore: offset + limit < (count?.count ?? 0),
    });
  } catch (error) {
    console.error("Failed to load Al Rahma products from D1.", error);
    return Response.json(
      { success: false, error: "Unable to load products from D1." },
      { status: 500 },
    );
  }
};
