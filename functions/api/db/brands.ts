interface Env { DB: D1Database }
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const { results } = await env.DB.prepare(`
      SELECT b.id, b.name_arabic, b.name_english, b.slug, b.identity_status,
             COUNT(p.id) AS product_count
      FROM brands b LEFT JOIN products p ON p.brand_id = b.id
      GROUP BY b.id ORDER BY b.name_arabic
    `).all();
    return Response.json({ success:true, brands:results });
  } catch (error) {
    return Response.json({ success:false, error:"D1 query failed", detail:String(error) }, { status:500 });
  }
};
