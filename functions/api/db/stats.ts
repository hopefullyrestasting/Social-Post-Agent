interface Env { DB: D1Database }
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const [products, brands, assets, campaigns, creatives, verified] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) AS count FROM products").first<{count:number}>(),
      env.DB.prepare("SELECT COUNT(*) AS count FROM brands").first<{count:number}>(),
      env.DB.prepare("SELECT COUNT(*) AS count FROM product_assets").first<{count:number}>(),
      env.DB.prepare("SELECT COUNT(*) AS count FROM campaigns").first<{count:number}>(),
      env.DB.prepare("SELECT COUNT(*) AS count FROM creatives").first<{count:number}>(),
      env.DB.prepare("SELECT COUNT(*) AS count FROM products WHERE verification_status = 'verified'").first<{count:number}>()
    ]);
    return Response.json({ success:true, stats:{ products:products?.count??0, brands:brands?.count??0, assets:assets?.count??0, campaigns:campaigns?.count??0, creatives:creatives?.count??0, verified:verified?.count??0 } });
  } catch (error) {
    return Response.json({ success:false, error:"D1 query failed", detail:String(error) }, { status:500 });
  }
};
