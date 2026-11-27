import { productOfferSettingKey, resolveTenantScope } from "../_tenant";
import { z } from "zod";
import {
  isSafeOfferText,
  isSafeSalesLine,
  sanitizeOfferText,
  sanitizeSalesLine,
} from "../../../src/lib/al-rahma/studio-fields";

interface Env {
  DB: D1Database;
  REQUIRE_ACCESS_KEY?: string;
}

interface ProductRow {
  id: string;
  name_arabic: string;
  name_english: string | null;
  category: string | null;
  subcategory: string | null;
  packaging_size: string | null;
  variant: string | null;
  description: string | null;
  sku: string | null;
  price: number | null;
  last_advertised_at: number | null;
  sales_line: string | null;
  offer_text: string | null;
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

/** Adds offer metadata from existing business_settings; never selects 0006 columns. */
async function loadOfferTexts(
  env: Env,
  rows: ProductRow[],
  tenantId: string | null,
): Promise<ProductRow[]> {
  if (rows.length === 0) return rows;
  const keys = rows.map((row) => productOfferSettingKey(tenantId, row.id));
  const placeholders = keys.map(() => "?").join(",");
  try {
    const settings = await env.DB.prepare(
      `SELECT key, value FROM business_settings WHERE key IN (${placeholders})`,
    )
      .bind(...keys)
      .all<{ key: string; value: string | null }>();
    const byKey = new Map(settings.results.map((row) => [row.key, row.value]));
    return rows.map((row) => {
      const raw = byKey.get(productOfferSettingKey(tenantId, row.id));
      return {
        ...row,
        offer_text: isSafeOfferText(raw) ? sanitizeOfferText(raw) : null,
      };
    });
  } catch {
    return rows.map((row) => ({ ...row, offer_text: null }));
  }
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

  const scope = await resolveTenantScope(request, env);
  if (!scope.ok) return scope.response;

  const query = (url.searchParams.get("q") || "").trim().slice(0, 100);
  const brand = (url.searchParams.get("brand") || "").trim().slice(0, 100);
  const status = (url.searchParams.get("status") || "").trim().slice(0, 50);
  const category = (url.searchParams.get("category") || "").trim().slice(0, 100);
  const where: string[] = [];
  const values: string[] = [];

  if (scope.tenantId) {
    where.push("p.tenant_key_id = ?");
    values.push(scope.tenantId);
  }
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
               p.packaging_size, p.variant, p.description AS sales_line, p.sku,
               p.price, p.last_advertised_at, p.egypt_market_status,
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
          ${scope.tenantId ? "AND tenant_key_id = ?" : ""}
        ORDER BY category
      `)
        .bind(...(scope.tenantId ? [scope.tenantId] : []))
        .all<CategoryRow>(),
    ]);

    const enrichedProducts = await loadOfferTexts(
      env,
      products.results,
      scope.tenantId,
    );

    return Response.json(
      {
        success: true,
        products: enrichedProducts,
        categories: categories.results.map((row) => row.category),
        total: count?.count ?? 0,
        limit,
        offset,
        hasMore: offset + limit < (count?.count ?? 0),
      },
      { headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" } },
    );
  } catch (error) {
    console.error("Failed to load Al Rahma products from D1.", error);
    return Response.json(
      { success: false, error: "Unable to load products from D1." },
      { status: 500 },
    );
  }
};

const productSchema = z
  .object({
    name_arabic: z.string().trim().min(1).max(200),
    name_english: z.string().trim().max(200).optional(),
    category: z.string().trim().max(100).optional(),
    subcategory: z.string().trim().max(100).optional(),
    packaging_size: z.string().trim().max(100).optional(),
    variant: z.string().trim().max(100).optional(),
    brand_id: z.string().trim().max(100).optional(),
    brand_slug: z.string().trim().max(100).optional(),
    description: z.string().trim().max(2000).optional(),
    sku: z.string().trim().max(100).optional(),
    price: z.number().finite().nonnegative().nullable().optional(),
    sales_line: z.string().trim().max(120).optional(),
    offer_text: z.string().trim().max(100).optional(),
  })
  .strict();

const bodySchema = z.union([
  productSchema,
  z.array(productSchema).min(1).max(500),
]);

async function ensureTenantBrand(
  env: Env,
  tenantId: string | null,
  tenant: { brand?: { brandName?: string } | null } | null,
): Promise<string> {
  if (tenantId) {
    const slug = "tenant-" + tenantId;
    const existing = await env.DB.prepare(
      "SELECT id FROM brands WHERE slug = ? LIMIT 1",
    )
      .bind(slug)
      .first<{ id: string }>();
    if (existing?.id) return existing.id;
    const id = crypto.randomUUID();
    const name = tenant?.brand?.brandName?.trim() || "Tenant Brand";
    await env.DB.prepare(
      "INSERT INTO brands (id, name_arabic, slug, identity_status, created_at) VALUES (?, ?, ?, 'needs_verification', ?)",
    )
      .bind(id, name, slug, Date.now())
      .run();
    return id;
  }
  const existing = await env.DB.prepare(
    "SELECT id FROM brands ORDER BY created_at ASC LIMIT 1",
  ).first<{ id: string }>();
  if (existing?.id) return existing.id;
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO brands (id, name_arabic, slug, identity_status, created_at) VALUES (?, ?, ?, 'needs_verification', ?)",
  )
    .bind(id, "Al Rahma", "al-rahma-default", Date.now())
    .run();
  return id;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const scope = await resolveTenantScope(request, env);
  if (!scope.ok) return scope.response;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      {
        success: false,
        error: "Invalid product payload.",
        detail: parsed.error.issues
          .map((i) => `${i.path.join(".") || "payload"}: ${i.message}`)
          .join("; "),
      },
      { status: 400 },
    );
  }

  const rows = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
  for (const row of rows) {
    if (row.sales_line?.trim() && !isSafeSalesLine(row.sales_line)) {
      return Response.json(
        { success: false, error: "sales_line must be a short, claim-free phrase." },
        { status: 400 },
      );
    }
    if (row.offer_text?.trim() && !isSafeOfferText(row.offer_text)) {
      return Response.json(
        { success: false, error: "offer_text contains unsupported claims or urgency." },
        { status: 400 },
      );
    }
  }

  const tenantId = scope.tenantId;
  const brandId = await ensureTenantBrand(env, tenantId, scope.tenant);

  const created: { id: string; name_arabic: string; upserted: boolean }[] = [];
  const now = Date.now();
  const statements: D1PreparedStatement[] = [];
  for (const row of rows) {
    const descriptionValue =
      row.sales_line !== undefined
        ? sanitizeSalesLine(row.sales_line) || null
        : row.description ?? null;
    let resolvedBrandId = brandId;
    if (row.brand_id) {
      const b = await env.DB.prepare(
        "SELECT id FROM brands WHERE id = ? LIMIT 1",
      )
        .bind(row.brand_id)
        .first<{ id: string }>();
      if (b?.id) resolvedBrandId = b.id;
    } else if (row.brand_slug) {
      const b = await env.DB.prepare(
        "SELECT id FROM brands WHERE slug = ? LIMIT 1",
      )
        .bind(row.brand_slug)
        .first<{ id: string }>();
      if (b?.id) resolvedBrandId = b.id;
    }

    // Upsert: reuse an existing product (scoped to tenant when a key is present)
    // with the same SKU or name.
    let existingId: string | null = null;
    if (row.sku) {
      const sql = tenantId
        ? "SELECT id FROM products WHERE tenant_key_id = ? AND sku = ? LIMIT 1"
        : "SELECT id FROM products WHERE sku = ? LIMIT 1";
      const binds = tenantId ? [tenantId, row.sku] : [row.sku];
      const e = await env.DB.prepare(sql).bind(...binds).first<{ id: string }>();
      if (e?.id) existingId = e.id;
    }
    if (!existingId) {
      const sql = tenantId
        ? "SELECT id FROM products WHERE tenant_key_id = ? AND name_arabic = ? LIMIT 1"
        : "SELECT id FROM products WHERE name_arabic = ? LIMIT 1";
      const binds = tenantId ? [tenantId, row.name_arabic] : [row.name_arabic];
      const e = await env.DB.prepare(sql).bind(...binds).first<{ id: string }>();
      if (e?.id) existingId = e.id;
    }

    if (existingId) {
      statements.push(
        env.DB.prepare(
          `UPDATE products
           SET brand_id = ?, name_english = ?, category = ?, subcategory = ?,
               packaging_size = ?, variant = ?, description = ?, sku = ?, price = ?,
               updated_at = ?
           WHERE id = ?`,
        ).bind(
          resolvedBrandId,
          row.name_english ?? null,
          row.category ?? null,
          row.subcategory ?? null,
          row.packaging_size ?? null,
          row.variant ?? null,
          descriptionValue,
          row.sku ?? null,
          row.price ?? null,
          now,
          existingId,
        ),
      );
      created.push({ id: existingId, name_arabic: row.name_arabic, upserted: true });
    } else {
      const id = crypto.randomUUID();
      statements.push(
        env.DB.prepare(
          `INSERT INTO products
             (id, brand_id, name_arabic, name_english, category, subcategory,
              packaging_size, variant, description, sku, price,
              verification_status, confidence_score, created_at, updated_at, tenant_key_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'needs_verification', 0, ?, ?, ?)`,
        ).bind(
          id,
          resolvedBrandId,
          row.name_arabic,
          row.name_english ?? null,
          row.category ?? null,
          row.subcategory ?? null,
          row.packaging_size ?? null,
          row.variant ?? null,
          descriptionValue,
          row.sku ?? null,
          row.price ?? null,
          now,
          now,
          tenantId,
        ),
      );
      created.push({ id, name_arabic: row.name_arabic, upserted: false });
    }
  }

  rows.forEach((row, index) => {
    if (row.offer_text === undefined) return;
    const productId = created[index]?.id;
    if (!productId) return;
    statements.push(
      env.DB.prepare(
        `INSERT INTO business_settings (key, value, updated_at, tenant_key_id)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value,
                                        updated_at = excluded.updated_at,
                                        tenant_key_id = excluded.tenant_key_id`,
      ).bind(
        productOfferSettingKey(tenantId, productId),
        sanitizeOfferText(row.offer_text) || null,
        now,
        tenantId,
      ),
    );
  });

  try {
    await env.DB.batch(statements);
  } catch (error) {
    console.error("Failed to create products.", error);
    return Response.json(
      { success: false, error: "Unable to create products." },
      { status: 500 },
    );
  }

  return Response.json(
    { success: true, created, count: created.length },
    { headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" } },
  );
};

const patchSchema = z
  .object({
    name_arabic: z.string().trim().min(1).max(200).optional(),
    price: z.number().finite().nonnegative().nullable().optional(),
    offer_text: z.string().trim().max(100).optional(),
    sales_line: z.string().trim().max(120).optional(),
  })
  .strict();

/** PATCH /api/db/products?id=... — PostCraft inline field edits. */
export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  const scope = await resolveTenantScope(request, env);
  if (!scope.ok) return scope.response;

  const url = new URL(request.url);
  const id = (url.searchParams.get("id") ?? "").trim().slice(0, 100);
  if (!id) {
    return Response.json(
      { success: false, error: "A product id is required." },
      { status: 400 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = patchSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      { success: false, error: "Invalid product patch payload." },
      { status: 400 },
    );
  }
  const patch = parsed.data;
  if (Object.keys(patch).length === 0) {
    return Response.json(
      { success: false, error: "No supported fields were provided." },
      { status: 400 },
    );
  }
  if (patch.sales_line?.trim() && !isSafeSalesLine(patch.sales_line)) {
    return Response.json(
      { success: false, error: "sales_line must be a short, claim-free phrase." },
      { status: 400 },
    );
  }
  if (patch.offer_text?.trim() && !isSafeOfferText(patch.offer_text)) {
    return Response.json(
      { success: false, error: "offer_text contains unsupported claims or urgency." },
      { status: 400 },
    );
  }

  const tenantId = scope.tenantId;
  try {
    const existing = await env.DB.prepare(
      `SELECT id, name_arabic, price, description AS sales_line
       FROM products WHERE id = ? ${tenantId ? "AND tenant_key_id = ?" : ""} LIMIT 1`,
    )
      .bind(...(tenantId ? [id, tenantId] : [id]))
      .first<{ id: string; name_arabic: string; price: number | null; sales_line: string | null }>();
    if (!existing) {
      return Response.json(
        { success: false, error: "Product not found." },
        { status: 404 },
      );
    }

    const now = Date.now();
    const statements: D1PreparedStatement[] = [];
    const sets: string[] = [];
    const values: (string | number | null)[] = [];

    if (patch.name_arabic !== undefined) {
      sets.push("name_arabic = ?");
      values.push(patch.name_arabic);
    }
    if (patch.price !== undefined) {
      sets.push("price = ?");
      values.push(patch.price);
    }
    if (patch.sales_line !== undefined) {
      sets.push("description = ?");
      values.push(sanitizeSalesLine(patch.sales_line) || null);
    }
    if (sets.length > 0) {
      sets.push("updated_at = ?");
      values.push(now, id, ...(tenantId ? [tenantId] : []));
      statements.push(
        env.DB.prepare(
          `UPDATE products SET ${sets.join(", ")} WHERE id = ? ${
            tenantId ? "AND tenant_key_id = ?" : ""
          }`,
        ).bind(...values),
      );
    }

    const settingKey = productOfferSettingKey(tenantId, id);
    let nextOfferText: string | null = null;
    if (patch.offer_text !== undefined) {
      nextOfferText = sanitizeOfferText(patch.offer_text) || null;
      statements.push(
        env.DB.prepare(
          `INSERT INTO business_settings (key, value, updated_at, tenant_key_id)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value,
                                          updated_at = excluded.updated_at,
                                          tenant_key_id = excluded.tenant_key_id`,
        ).bind(settingKey, nextOfferText, now, tenantId),
      );
    } else {
      const setting = await env.DB.prepare(
        "SELECT value FROM business_settings WHERE key = ? LIMIT 1",
      )
        .bind(settingKey)
        .first<{ value: string | null }>();
      nextOfferText = setting && isSafeOfferText(setting.value)
        ? sanitizeOfferText(setting.value)
        : null;
    }

    await env.DB.batch(statements);

    return Response.json(
      {
        success: true,
        product: {
          id,
          name_arabic: patch.name_arabic ?? existing.name_arabic,
          price: patch.price !== undefined ? patch.price : existing.price,
          sales_line:
            patch.sales_line !== undefined
              ? sanitizeSalesLine(patch.sales_line) || null
              : existing.sales_line,
          offer_text: nextOfferText,
        },
      },
      { headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" } },
    );
  } catch (error) {
    console.error("Failed to patch product.", error);
    return Response.json(
      { success: false, error: "Unable to update the product." },
      { status: 500 },
    );
  }
};
