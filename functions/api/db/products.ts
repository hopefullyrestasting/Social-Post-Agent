interface Env { DB: D1Database }
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").trim().slice(0,100);
    const brand = (url.searchParams.get("brand") || "").trim().slice(0,100);
    const status = (url.searchParams.get("status") || "").trim().slice(0,50);
    const limit = Math.min(250, Math.max(1, Number(url.searchParams.get("limit") || 250)));
    const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
    const where:string[]=[]; const values:(string|number)[]=[];
    if(q){where.push("(p.name_arabic LIKE ? OR p.name_english LIKE ? OR p.category LIKE ?)"); values.push(`%${q}%`,`%${q}%`,`%${q}%`);}
    if(brand){where.push("b.slug = ?");values.push(brand);}
    if(status){where.push("p.verification_status = ?");values.push(status);}
    const clause=where.length?"WHERE "+where.join(" AND "):"";
    const count=await env.DB.prepare(`SELECT COUNT(*) AS count FROM products p JOIN brands b ON b.id=p.brand_id ${clause}`).bind(...values).first<{count:number}>();
    const {results}=await env.DB.prepare(`
      SELECT p.id,p.name_arabic,p.name_english,p.category,p.subcategory,p.packaging_size,p.variant,
             p.egypt_market_status,p.warehouse_stock_status,p.verification_status,p.confidence_score,
             b.name_arabic AS brand_arabic,b.name_english AS brand_english,b.slug AS brand_slug,
             (SELECT pa.image_url FROM product_assets pa WHERE pa.product_id=p.id AND pa.is_primary=1 LIMIT 1) AS image_url,
             (SELECT pa.source_url FROM product_assets pa WHERE pa.product_id=p.id AND pa.is_primary=1 LIMIT 1) AS image_source
      FROM products p JOIN brands b ON b.id=p.brand_id ${clause}
      ORDER BY b.name_arabic,p.name_arabic LIMIT ? OFFSET ?
    `).bind(...values,limit,offset).all();
    return Response.json({success:true,total:count?.count??0,limit,offset,products:results});
  } catch(error) {
    return Response.json({success:false,error:"D1 query failed",detail:String(error)},{status:500});
  }
};
