"use client";
import { useEffect, useMemo, useState } from "react";

type Tenant = { id:string; label:string|null; status:string; expires_at:number|null; brand_locked:number; locked_brand_name:string|null; locked_industry:string|null; total_products:number; generated_products:number; };
type Health = { tenants:{total:number;active:number;revoked:number;expired:number};products:{total:number;generated:number;remaining:number} };

export default function AdminPage() {
 const [key,setKey]=useState(""); const [health,setHealth]=useState<Health|null>(null); const [tenants,setTenants]=useState<Tenant[]>([]); const [query,setQuery]=useState(""); const [status,setStatus]=useState(""); const [error,setError]=useState("");
 const headers=useMemo(()=>({"X-Admin-Key":key}),[key]);
 const load=async()=>{ if(!key.trim()) return; setError(""); try { const [h,t]=await Promise.all([fetch("/api/admin/health",{headers}),fetch("/api/admin/tenants?limit=50&q="+encodeURIComponent(query)+"&status="+encodeURIComponent(status),{headers})]); if(!h.ok||!t.ok) throw new Error("Admin access was rejected."); setHealth(await h.json()); setTenants((await t.json()).tenants); } catch(e){setError(e instanceof Error?e.message:"Unable to load admin data.");} };
 useEffect(()=>{void load();},[key,status]); // key is held only in page memory
 const action=async(tenantId:string,action:string)=>{ if(!confirm("Confirm support action: "+action+"?")) return; const response=await fetch("/api/admin/support",{method:"POST",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify({tenantId,action})}); if(!response.ok){setError("Support action failed.");return;} void load(); };
 return <main dir="ltr" style={{minHeight:"100vh",background:"#fff",color:"#102a5c",fontFamily:"Arial, sans-serif",padding:24}}>
  <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"2px solid #2563EB",paddingBottom:18}}>
   <div><b style={{fontSize:30,color:"#1D4ED8"}}>iD</b><span style={{marginLeft:10,fontWeight:700}}>Owner Admin & Support</span><small style={{display:"block",color:"#2563EB"}}>idesign.social · info@idesign.social · +201097362000</small></div>
   <label>Admin key <input type="password" value={key} onChange={e=>setKey(e.target.value)} placeholder="Held only in this tab" style={{marginLeft:8,padding:8,border:"1px solid #2563EB"}} /></label>
  </header>
  {error && <p style={{color:"#b91c1c"}}>{error}</p>}
  {health && <section style={{display:"flex",gap:12,flexWrap:"wrap",margin:"24px 0"}}>{[
   ["Active tenants",health.tenants.active],["Expired / revoked",health.tenants.expired+health.tenants.revoked],["Products",health.products.total],["Generated",health.products.generated],["Remaining",health.products.remaining]
  ].map(([label,value])=><div key={String(label)} style={{border:"1px solid #bfdbfe",borderRadius:10,padding:14,minWidth:130}}><small>{label}</small><strong style={{display:"block",fontSize:25,color:"#1D4ED8"}}>{value}</strong></div>)}</section>}
  <section style={{display:"flex",gap:8,marginBottom:14}}><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search label, brand or industry" /><select value={status} onChange={e=>setStatus(e.target.value)}><option value="">All statuses</option><option value="active">Active</option><option value="revoked">Revoked</option></select><button onClick={()=>void load()}>Search</button></section>
  <section style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["Customer","Brand","Status","Products","Queue","Support"].map(x=><th key={x} style={{textAlign:"left",padding:10,borderBottom:"1px solid #bfdbfe"}}>{x}</th>)}</tr></thead><tbody>{tenants.map(t=><tr key={t.id}><td style={{padding:10}}>{t.label||"Untitled"}<small style={{display:"block"}}>{t.id}</small></td><td>{t.locked_brand_name||"Not locked"}<small style={{display:"block"}}>{t.locked_industry||""}</small></td><td>{t.status}</td><td>{t.generated_products}/{t.total_products}</td><td>{t.brand_locked?"Locked":"Open"}</td><td><button onClick={()=>void action(t.id,"reset_queue")}>Reset queue</button> <button onClick={()=>void action(t.id,t.status==="active"?"set_status":"set_status")}>{t.status==="active"?"Revoke":"Activate"}</button> <button onClick={()=>void action(t.id,"unlock_brand")}>Unlock brand</button></td></tr>)}</tbody></table></section>
 </main>;
}
