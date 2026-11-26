"use client";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import IDMark from "@/components/idesign/id-mark";
import { IDESIGN_STUDIO_CONFIG } from "@/lib/al-rahma/brand-core";

type Tenant = { id:string; label:string|null; status:string; expires_at:number|null; brand_locked:number; locked_brand_name:string|null; locked_industry:string|null; total_products:number; generated_products:number; };
type Health = { tenants:{total:number;active:number;revoked:number;expired:number};products:{total:number;generated:number;remaining:number} };
type TenantsResponse = { tenants:Tenant[] };
type IssuedTenant = { id:string; access_key:string; label:string|null; expires_at:number; plan:string; quota_total:number; locale:string; };
const STUDIO_URL = "https://social-post-agent.pages.dev/dashboard";

export default function AdminPage() {
 const [key,setKey]=useState(""); const [health,setHealth]=useState<Health|null>(null); const [tenants,setTenants]=useState<Tenant[]>([]); const [query,setQuery]=useState(""); const [status,setStatus]=useState(""); const [error,setError]=useState("");
 const [clientLabel,setClientLabel]=useState(""); const [clientEmail,setClientEmail]=useState(""); const [plan,setPlan]=useState("annual"); const [expiresInDays,setExpiresInDays]=useState(365); const [quotaTotal,setQuotaTotal]=useState(0); const [locale,setLocale]=useState("en");
 const [generating,setGenerating]=useState(false); const [issued,setIssued]=useState<IssuedTenant|null>(null); const [copied,setCopied]=useState(false);
 const headers=useMemo(()=>({"X-Admin-Key":key}),[key]);
 const load=useCallback(async()=>{ if(!key.trim()) return; setError(""); try { const [h,t]=await Promise.all([fetch("/api/admin/health",{headers}),fetch("/api/admin/tenants?limit=50&q="+encodeURIComponent(query)+"&status="+encodeURIComponent(status),{headers})]); if(!h.ok||!t.ok) throw new Error("Admin access was rejected."); setHealth((await h.json()) as Health); setTenants(((await t.json()) as TenantsResponse).tenants); } catch(e){setError(e instanceof Error?e.message:"Unable to load admin data.");} },[key,headers,query,status]);
 useEffect(()=>{queueMicrotask(()=>{void load();});},[load]); // key is held only in page memory
 const action=async(tenantId:string,action:string,statusOverride?:string)=>{ if(!confirm("Confirm support action: "+action+"?")) return; const response=await fetch("/api/admin/support",{method:"POST",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify({tenantId,action,...(statusOverride?{status:statusOverride}:{})})}); if(!response.ok){setError("Support action failed.");return;} void load(); };
 const generate=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();setError("");setIssued(null);setCopied(false);setGenerating(true);try{const response=await fetch("/api/admin/provision",{method:"POST",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify({label:clientLabel,client_email:clientEmail,plan,expires_in_days:expiresInDays,quota_total:quotaTotal,locale})});const result=await response.json() as {success?:boolean;error?:string;issued?:IssuedTenant[]};if(!response.ok||!result.success||!result.issued?.[0])throw new Error(result.error||"Unable to generate client key.");setIssued(result.issued[0]);void load();}catch(caught){setError(caught instanceof Error?caught.message:"Unable to generate client key.");}finally{setGenerating(false);}};
 const copyKey=async()=>{if(!issued)return;try{await navigator.clipboard.writeText(issued.access_key);setCopied(true);}catch{setError("Could not copy the key. Select and copy it manually.");}};
 return <main dir="ltr" style={{minHeight:"100vh",background:"#fff",color:"#102a5c",fontFamily:"Arial, sans-serif",padding:24}}>
  <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"2px solid #2563EB",paddingBottom:18}}>
   <div><IDMark size={30} small /><span style={{marginLeft:10,fontWeight:700}}>Owner Admin & Support</span><small style={{display:"block",color:"#2563EB"}}>{IDESIGN_STUDIO_CONFIG.websiteLabel} · {IDESIGN_STUDIO_CONFIG.email} · {IDESIGN_STUDIO_CONFIG.phoneLabel}</small></div>
   <label>Admin key <input type="password" value={key} onChange={e=>setKey(e.target.value)} placeholder="Held only in this tab" style={{marginLeft:8,padding:8,border:"1px solid #2563EB"}} /></label>
  </header>
  {error && <p style={{color:"#b91c1c"}}>{error}</p>}
  <section style={{maxWidth:900,margin:"24px 0",padding:20,border:"1px solid #bfdbfe",borderRadius:12}}>
   <h2 style={{margin:"0 0 16px",fontSize:20,fontWeight:700}}>Generate Client Key</h2>
   <form onSubmit={generate} style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:12}}>
    <label>Client / label<input required maxLength={120} value={clientLabel} onChange={e=>setClientLabel(e.target.value)} style={{display:"block",width:"100%",padding:8,border:"1px solid #bfdbfe"}} /></label>
    <label>Client email<input type="email" maxLength={254} value={clientEmail} onChange={e=>setClientEmail(e.target.value)} style={{display:"block",width:"100%",padding:8,border:"1px solid #bfdbfe"}} /></label>
    <label>Plan<input required maxLength={40} pattern="[A-Za-z0-9_-]+" value={plan} onChange={e=>setPlan(e.target.value)} style={{display:"block",width:"100%",padding:8,border:"1px solid #bfdbfe"}} /></label>
    <label>Expires in days<input type="number" min={1} max={3650} required value={expiresInDays} onChange={e=>setExpiresInDays(Number(e.target.value))} style={{display:"block",width:"100%",padding:8,border:"1px solid #bfdbfe"}} /></label>
    <label>Quota (0 = unlimited)<input type="number" min={0} max={1000000000} required value={quotaTotal} onChange={e=>setQuotaTotal(Number(e.target.value))} style={{display:"block",width:"100%",padding:8,border:"1px solid #bfdbfe"}} /></label>
    <label>Default locale<select value={locale} onChange={e=>setLocale(e.target.value)} style={{display:"block",width:"100%",padding:8,border:"1px solid #bfdbfe"}}><option value="en">English (LTR)</option><option value="ar">العربية (RTL)</option></select></label>
    <button type="submit" disabled={generating||!key.trim()} style={{alignSelf:"end",padding:"10px 16px",borderRadius:8,background:"#1D4ED8",color:"#fff",fontWeight:700,opacity:generating||!key.trim()?0.6:1}}>{generating?"Generating…":"Generate Client Key"}</button>
   </form>
   {issued&&<div role="status" style={{marginTop:18,padding:14,border:"1px solid #86efac",borderRadius:8,background:"#f0fdf4"}}>
    <strong>Key created for {issued.label||"client"}.</strong>
    <p style={{margin:"8px 0"}}>Plan: {issued.plan} · Quota: {issued.quota_total===0?"Unlimited":issued.quota_total} · Locale: {issued.locale.toUpperCase()}</p>
    <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
     <code style={{overflowWrap:"anywhere",padding:8,background:"#fff",border:"1px solid #bbf7d0"}}>{issued.access_key}</code>
     <button type="button" onClick={()=>void copyKey()} style={{padding:"8px 12px",border:"1px solid #16a34a",borderRadius:6}}>{copied?"Copied":"Copy key"}</button>
    </div>
    <p style={{marginBottom:0}}>Studio: <a href={STUDIO_URL} target="_blank" rel="noreferrer" style={{color:"#1D4ED8",textDecoration:"underline"}}>{STUDIO_URL}</a></p>
   </div>}
  </section>
  {health && <section style={{display:"flex",gap:12,flexWrap:"wrap",margin:"24px 0"}}>{[
   ["Active tenants",health.tenants.active],["Expired / revoked",health.tenants.expired+health.tenants.revoked],["Products",health.products.total],["Generated",health.products.generated],["Remaining",health.products.remaining]
  ].map(([label,value])=><div key={String(label)} style={{border:"1px solid #bfdbfe",borderRadius:10,padding:14,minWidth:130}}><small>{label}</small><strong style={{display:"block",fontSize:25,color:"#1D4ED8"}}>{value}</strong></div>)}</section>}
  <section style={{display:"flex",gap:8,marginBottom:14}}><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search label, brand or industry" /><select value={status} onChange={e=>setStatus(e.target.value)}><option value="">All statuses</option><option value="active">Active</option><option value="revoked">Revoked</option></select><button onClick={()=>void load()}>Search</button></section>
  <section style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["Customer","Brand","Status","Products","Queue","Support"].map(x=><th key={x} style={{textAlign:"left",padding:10,borderBottom:"1px solid #bfdbfe"}}>{x}</th>)}</tr></thead><tbody>{tenants.map(t=><tr key={t.id}><td style={{padding:10}}>{t.label||"Untitled"}<small style={{display:"block"}}>{t.id}</small></td><td>{t.locked_brand_name||"Not locked"}<small style={{display:"block"}}>{t.locked_industry||""}</small></td><td>{t.status}</td><td>{t.generated_products}/{t.total_products}</td><td>{t.brand_locked?"Locked":"Open"}</td><td><button onClick={()=>void action(t.id,"reset_queue")}>Reset queue</button> <button onClick={()=>void action(t.id,"set_status",t.status==="active"?"revoked":"active")}>{t.status==="active"?"Revoke":"Activate"}</button> <button onClick={()=>void action(t.id,"unlock_brand")}>Unlock brand</button> <button onClick={()=>void action(t.id,"clear_generation_lease")}>Clear generation lease</button></td></tr>)}</tbody></table></section>
 </main>;
}
