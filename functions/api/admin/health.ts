import { requireAdmin, noStore } from "./_admin";
interface Env { DB:D1Database; ADMIN_API_KEY?:string; }
export const onRequestGet: PagesFunction<Env> = async ({request,env}) => {
 const denied=await requireAdmin(request,env); if(denied)return denied;
 const now=Math.floor(Date.now()/1000);
 const [keys,products,generated]=await Promise.all([
  env.DB.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN status='active' AND (expires_at IS NULL OR expires_at > ?) THEN 1 ELSE 0 END) AS active, SUM(CASE WHEN status='revoked' THEN 1 ELSE 0 END) AS revoked, SUM(CASE WHEN expires_at IS NOT NULL AND expires_at <= ? THEN 1 ELSE 0 END) AS expired FROM activation_keys").bind(now,now).first<Record<string,number>>(),
  env.DB.prepare("SELECT COUNT(*) AS total FROM products").first<{total:number}>(),
  env.DB.prepare("SELECT COUNT(*) AS total FROM products WHERE last_advertised_at IS NOT NULL").first<{total:number}>(),
 ]);
 return Response.json({success:true,generatedAt:new Date().toISOString(),tenants:{total:keys?.total ?? 0,active:keys?.active ?? 0,revoked:keys?.revoked ?? 0,expired:keys?.expired ?? 0},products:{total:products?.total ?? 0,generated:generated?.total ?? 0,remaining:Math.max(0,(products?.total ?? 0)-(generated?.total ?? 0))},recent:{errors:null,note:"No cross-tenant error log is persisted; Workers logs remain the source of request diagnostics."}},{headers:noStore()});
};