import { requireAdmin, noStore } from "./_admin";
import { hashAccessKey, nowSeconds, tenantSettingKey } from "../_tenant";
interface Env { DB:D1Database; ADMIN_API_KEY?:string; }
const key=()=> "arh_"+Array.from(crypto.getRandomValues(new Uint8Array(24))).map(x=>x.toString(16).padStart(2,"0")).join("");
export const onRequestPost: PagesFunction<Env> = async ({request,env}) => {
 const denied=await requireAdmin(request,env); if(denied)return denied;
 let body:Record<string,unknown>; try{body=await request.json() as Record<string,unknown>;}catch{return Response.json({success:false,error:"Invalid JSON."},{status:400});}
 const copies=Array.isArray(body.copies)?body.copies:[body]; if(!copies.length||copies.length>100)return Response.json({success:false,error:"Provide 1–100 copies."},{status:400});
 const now=nowSeconds(); const issued:{id:string;access_key:string;label:string|null;expires_at:number;copy_kind:string}[]=[];
 const statements:D1PreparedStatement[]=[];
 for(const raw of copies){const item=raw&&typeof raw==="object"?raw as Record<string,unknown>:{};const days=Number(item.expires_in_days??365);if(!Number.isInteger(days)||days<1||days>3650)return Response.json({success:false,error:"expires_in_days must be 1–3650."},{status:400});
  const label=typeof item.label==="string"?item.label.trim().slice(0,120):null; const copyKind=["customer","marketing","demo"].includes(String(item.copy_kind))?String(item.copy_kind):"customer"; const access_key=key(),id=crypto.randomUUID(),expires_at=now+days*86400; const hash=await hashAccessKey(access_key);
  statements.push(env.DB.prepare("INSERT INTO activation_keys (id,key_hash,label,status,created_at,expires_at,brand_locked,quota_total,quota_used) VALUES (?,?,?,'active',?,?,0,0,0)").bind(id,hash,label,now,expires_at));
  const metadata={notes:typeof item.notes==="string"?item.notes.slice(0,2000):null,copy_kind:copyKind,brand_defaults:item.brand_defaults&&typeof item.brand_defaults==="object"?JSON.stringify(item.brand_defaults):null};
  for(const [setting,value] of Object.entries(metadata))statements.push(env.DB.prepare("INSERT INTO business_settings (key,value,updated_at,tenant_key_id) VALUES (?,?,?,?)").bind(tenantSettingKey(id,"provisioning."+setting),value,Date.now(),id));
  issued.push({id,access_key,label,expires_at,copy_kind:copyKind});
 }
 await env.DB.batch(statements); return Response.json({success:true,issued},{headers:noStore()});
};