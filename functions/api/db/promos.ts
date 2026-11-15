import { z } from "zod";
import { cairoToday, isIsoDate } from "../_dates";

/**
 * GET  /api/db/promos?product_id=...  → active, in-window promotions only.
 * POST /api/db/promos                 → create (or reactivate) a promotion.
 *
 * Prices are always derived server-side from `original_price` and
 * `discount_percent`; the client can never submit a final price. New rows are
 * appended and the previous active row for the product is deactivated, never
 * overwritten or deleted.
 */

interface Env {
  DB: D1Database;
}

interface PromotionRow {
  id: string;
  product_id: string;
  product_name_arabic: string;
  original_price: number;
  discount_percent: number;
  promo_price: number;
  starts_at: string;
  ends_at: string;
  is_active: number;
  created_at: string;
}

const isoDate = z
  .string()
  .trim()
  .max(10)
  .refine((value) => isIsoDate(value), {
    message: "Expected a real calendar date in YYYY-MM-DD form.",
  });

const promotionSchema = z
  .object({
    product_id: z.string().trim().min(1).max(100),
    original_price: z.number().finite().positive().max(1_000_000),
    discount_percent: z.number().int().min(1).max(99),
    starts_at: isoDate,
    ends_at: isoDate,
    is_active: z.boolean().optional(),
  })
  .strict();

function roundPrice(value: number): number {
  return Math.round(value * 100) / 100;
}

function calculatePromoPrice(
  originalPrice: number,
  discountPercent: number,
): number {
  return roundPrice(originalPrice * ((100 - discountPercent) / 100));
}

function normalize(row: PromotionRow, today: string) {
  const expectedPrice = calculatePromoPrice(
    row.original_price,
    row.discount_percent,
  );
  const valid =
    row.original_price > 0 &&
    row.promo_price > 0 &&
    Number.isInteger(row.discount_percent) &&
    row.discount_percent >= 1 &&
    row.discount_percent <= 99 &&
    Math.abs(expectedPrice - row.promo_price) <= 0.011 &&
    row.starts_at <= row.ends_at;

  const status =
    !row.is_active
      ? "inactive"
      : today < row.starts_at
        ? "scheduled"
        : today > row.ends_at
          ? "expired"
          : "active";

  return {
    ...row,
    promo_price: expectedPrice,
    valid,
    status,
  };
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const productId = (url.searchParams.get("product_id") ?? "").trim();

  if (productId.length > 100) {
    return Response.json(
      { success: false, error: "product_id must be 100 characters or fewer." },
      { status: 400 },
    );
  }

  const today = cairoToday();
  const values: string[] = [today, today];
  const productClause = productId ? "AND pp.product_id = ?" : "";
  if (productId) values.push(productId);

  try {
    const rows = await env.DB.prepare(
      `SELECT pp.id, pp.product_id, p.name_arabic AS product_name_arabic,
              pp.original_price, pp.discount_percent, pp.promo_price,
              pp.starts_at, pp.ends_at, pp.is_active, pp.created_at
       FROM product_promotions pp
       JOIN products p ON p.id = pp.product_id
       WHERE pp.is_active = 1
         AND pp.starts_at <= ?
         AND pp.ends_at >= ?
         ${productClause}
       ORDER BY pp.created_at DESC, pp.id
       LIMIT 100`,
    )
      .bind(...values)
      .all<PromotionRow>();

    return Response.json({
      success: true,
      today,
      promos: rows.results.map((row) => normalize(row, today)),
    });
  } catch (error) {
    console.error("Failed to load product promotions from D1.", error);
    return Response.json(
      { success: false, error: "Unable to load promotions from D1." },
      { status: 500 },
    );
  }
};

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

  const parsed = promotionSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      {
        success: false,
        error: "Invalid promotion payload.",
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
  if (data.starts_at > data.ends_at) {
    return Response.json(
      { success: false, error: "starts_at must be on or before ends_at." },
      { status: 400 },
    );
  }

  const today = cairoToday();
  const promoPrice = calculatePromoPrice(
    data.original_price,
    data.discount_percent,
  );
  const isActive = data.is_active === false ? 0 : 1;
  const now = Date.now();

  try {
    const product = await env.DB.prepare(
      "SELECT id, name_arabic FROM products WHERE id = ?",
    )
      .bind(data.product_id)
      .first<{ id: string; name_arabic: string }>();

    if (!product) {
      return Response.json(
        { success: false, error: "Product not found." },
        { status: 404 },
      );
    }

    const existing = await env.DB.prepare(
      `SELECT id FROM product_promotions
       WHERE product_id = ? AND original_price = ? AND discount_percent = ?
         AND starts_at = ? AND ends_at = ?
       ORDER BY created_at DESC
       LIMIT 1`,
    )
      .bind(
        data.product_id,
        data.original_price,
        data.discount_percent,
        data.starts_at,
        data.ends_at,
      )
      .first<{ id: string }>();

    const promotionId = existing?.id ?? crypto.randomUUID();
    const statements: D1PreparedStatement[] = [
      env.DB.prepare(
        `UPDATE product_promotions SET is_active = 0
         WHERE product_id = ? AND is_active = 1 AND id != ?`,
      ).bind(data.product_id, promotionId),
    ];

    if (existing) {
      statements.push(
        env.DB.prepare(
          `UPDATE product_promotions
           SET original_price = ?, discount_percent = ?, promo_price = ?,
               starts_at = ?, ends_at = ?, is_active = ?
           WHERE id = ? AND product_id = ?`,
        ).bind(
          data.original_price,
          data.discount_percent,
          promoPrice,
          data.starts_at,
          data.ends_at,
          isActive,
          promotionId,
          data.product_id,
        ),
      );
    } else {
      statements.push(
        env.DB.prepare(
          `INSERT INTO product_promotions
             (id, product_id, original_price, discount_percent, promo_price,
              starts_at, ends_at, is_active, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          promotionId,
          data.product_id,
          data.original_price,
          data.discount_percent,
          promoPrice,
          data.starts_at,
          data.ends_at,
          isActive,
          now,
        ),
      );
    }

    await env.DB.batch(statements);

    const row = await env.DB.prepare(
      `SELECT pp.id, pp.product_id, p.name_arabic AS product_name_arabic,
              pp.original_price, pp.discount_percent, pp.promo_price,
              pp.starts_at, pp.ends_at, pp.is_active, pp.created_at
       FROM product_promotions pp
       JOIN products p ON p.id = pp.product_id
       WHERE pp.id = ? AND pp.product_id = ?`,
    )
      .bind(promotionId, data.product_id)
      .first<PromotionRow>();

    return Response.json({
      success: true,
      reused: Boolean(existing),
      promo: row
        ? normalize(row, today)
        : {
            id: promotionId,
            product_id: data.product_id,
            product_name_arabic: product.name_arabic,
            original_price: data.original_price,
            discount_percent: data.discount_percent,
            promo_price: promoPrice,
            starts_at: data.starts_at,
            ends_at: data.ends_at,
            is_active: isActive,
            created_at: now,
            valid: true,
            status: !isActive
              ? "inactive"
              : today < data.starts_at
                ? "scheduled"
                : "active",
          },
    });
  } catch (error) {
    console.error("Failed to save product promotion to D1.", error);
    return Response.json(
      { success: false, error: "Unable to save the promotion to D1." },
      { status: 500 },
    );
  }
};
