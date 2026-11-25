import { requireAdmin, noStore } from "./_admin";

interface Env { DB: D1Database; ADMIN_API_KEY?: string; }
const text = (value: unknown, limit = 500) => typeof value === "string" ? value.trim().slice(0, limit) : "";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return Response.json({success:false,error:"Invalid JSON."},{status:400}); }
  const tenantId = text(body.tenantId, 100); const action = text(body.action, 40);
  if (!tenantId || !action) return Response.json({success:false,error:"tenantId and action are required."},{status:400});
  const tenant = await env.DB.prepare("SELECT id FROM activation_keys WHERE id = ? LIMIT 1").bind(tenantId).first();
  if (!tenant) return Response.json({success:false,error:"Tenant not found."},{status:404});
  const now = Math.floor(Date.now()/1000);
  if (action === "set_status") {
    const status = text(body.status,20); if (!["active","revoked"].includes(status)) return Response.json({success:false,error:"Unsupported status."},{status:400});
    await env.DB.prepare("UPDATE activation_keys SET status = ? WHERE id = ?").bind(status,tenantId).run();
  } else if (action === "extend_expiry") {
    const days = Number(body.days); if (!Number.isInteger(days) || days < 1 || days > 3650) return Response.json({success:false,error:"days must be 1–3650."},{status:400});
    await env.DB.prepare("UPDATE activation_keys SET expires_at = MAX(COALESCE(expires_at, ?), ?) + ? WHERE id = ?").bind(now,now,days*86400,tenantId).run();
  } else if (action === "unlock_brand") {
    await env.DB.prepare("UPDATE activation_keys SET brand_locked = 0, locked_at = NULL WHERE id = ?").bind(tenantId).run();
  } else if (action === "override_brand") {
    const brandName=text(body.brandName,120), industry=text(body.industry,120), logoUrl=text(body.logoUrl,2048);
    if (!brandName || !industry) return Response.json({success:false,error:"brandName and industry are required."},{status:400});
    const metadata=JSON.stringify({brandName,industry,logoUrl:logoUrl || null,contactInfo:body.contactInfo ?? null,locale:text(body.locale,16) || "en",rtl:body.rtl !== false});
    await env.DB.prepare("UPDATE activation_keys SET brand_locked=1, locked_brand_name=?, locked_industry=?, locked_logo_url=?, locked_brand_json=?, locked_at=? WHERE id=?").bind(brandName,industry,logoUrl || null,metadata,now,tenantId).run();
  } else if (action === "requeue_product" || action === "delete_product") {
    const productId=text(body.productId,100); if (!productId) return Response.json({success:false,error:"productId is required."},{status:400});
    const sql=action === "delete_product" ? "DELETE FROM products WHERE id=? AND tenant_key_id=?" : "UPDATE products SET last_advertised_at = NULL, updated_at = ? WHERE id=? AND tenant_key_id=?";
    await env.DB.prepare(sql).bind(...(action === "delete_product" ? [productId,tenantId] : [Date.now(),productId,tenantId])).run();
  } else if (action === "reset_queue") {
    await env.DB.prepare("UPDATE products SET last_advertised_at = NULL, updated_at = ? WHERE tenant_key_id = ?").bind(Date.now(),tenantId).run();
  } else if (action === "clear_generation_lease") {
    // Owner escape hatch for a worker that died while holding a future lease.
    // Scoped to one tenant row; never a bulk update.
    await env.DB.prepare("UPDATE activation_keys SET in_flight_until = NULL, last_generation_at = 0 WHERE id = ?").bind(tenantId).run();
  } else return Response.json({success:false,error:"Unsupported action."},{status:400});
  return Response.json({success:true,action,tenantId},{headers:noStore()});
};
