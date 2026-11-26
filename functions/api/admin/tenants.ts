import { requireAdmin, noStore } from "./_admin";

interface Env { DB: D1Database; ADMIN_API_KEY?: string; }
const integer = (raw: string | null, fallback: number, max: number) => {
  const value = raw === null ? fallback : Number(raw);
  return Number.isSafeInteger(value) && value >= 0 ? Math.min(value, max) : null;
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const url = new URL(request.url);
  const limit = integer(url.searchParams.get("limit"), 50, 100);
  const offset = integer(url.searchParams.get("offset"), 0, Number.MAX_SAFE_INTEGER);
  if (limit === null || limit < 1 || offset === null) return Response.json({ success:false, error:"Invalid pagination." }, { status:400 });
  const status = (url.searchParams.get("status") ?? "").trim().slice(0, 20);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const where: string[] = []; const values: string[] = [];
  if (status) { where.push("k.status = ?"); values.push(status); }
  if (q) { where.push("(k.label LIKE ? OR k.locked_brand_name LIKE ? OR k.locked_industry LIKE ?)"); values.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const count = await env.DB.prepare(`SELECT COUNT(*) AS count FROM activation_keys k ${clause}`).bind(...values).first<{count:number}>();
  const result = await env.DB.prepare(`
    SELECT k.id, k.label, k.status, k.created_at, k.expires_at, k.brand_locked,
           k.locked_brand_name, k.locked_industry, k.locked_logo_url,
           (SELECT COUNT(*) FROM products p WHERE p.tenant_key_id = k.id) AS total_products,
           (SELECT COUNT(*) FROM products p WHERE p.tenant_key_id = k.id AND p.last_advertised_at IS NOT NULL) AS generated_products
    FROM activation_keys k ${clause}
    ORDER BY k.created_at DESC, k.id DESC LIMIT ? OFFSET ?`).bind(...values, limit, offset).all();
  return Response.json({ success:true, tenants:result.results, total:count?.count ?? 0, limit, offset, hasMore:offset + limit < (count?.count ?? 0) }, { headers:noStore() });
};
