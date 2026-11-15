interface Env {
  DB: D1Database;
}

interface BrandRow {
  id: string;
  name_arabic: string;
  name_english: string | null;
  slug: string;
  identity_status: string;
  product_count: number;
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const { results } = await env.DB.prepare(`
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
