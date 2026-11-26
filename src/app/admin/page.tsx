"use client";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import IDMark from "@/components/idesign/id-mark";
import { IDESIGN_STUDIO_CONFIG } from "@/lib/al-rahma/brand-core";

type Tenant = { id:string; label:string|null; status:string; expires_at:number|null; brand_locked:number; locked_brand_name:string|null; locked_industry:string|null; total_products:number; generated_products:number; };
type Health = { tenants:{total:number;active:number;revoked:number;expired:number};products:{total:number;generated:number;remaining:number} };
type TenantsResponse = { tenants:Tenant[] };
type IssuedTenant = { id:string; access_key:string; label:string|null; expires_at:number; plan:string; quota_total:number; locale:string; };
const STUDIO_URL = "https://social-post-agent.pages.dev/dashboard";
const ADMIN_KEY_STORAGE = "social-post-agent-admin-key";
const REMEMBER_KEY_STORAGE = "social-post-agent-remember-admin-key";

export default function AdminPage() {
 const [key,setKey]=useState(""); const [health,setHealth]=useState<Health|null>(null); const [tenants,setTenants]=useState<Tenant[]>([]); const [query,setQuery]=useState(""); const [status,setStatus]=useState(""); const [error,setError]=useState("");
 const [clientLabel,setClientLabel]=useState(""); const [clientEmail,setClientEmail]=useState(""); const [plan,setPlan]=useState("annual"); const [expiresInDays,setExpiresInDays]=useState(365); const [quotaTotal,setQuotaTotal]=useState(0); const [locale,setLocale]=useState("en");
 const [generating,setGenerating]=useState(false); const [issued,setIssued]=useState<IssuedTenant|null>(null); const [copied,setCopied]=useState(false);
 const [showKey,setShowKey]=useState(false); const [rememberKey,setRememberKey]=useState(false);
 const headers=useMemo(()=>({"X-Admin-Key":key}),[key]);
 const load=useCallback(async()=>{ if(!key.trim()){setHealth(null);setTenants([]);setError("");return;} setError(""); try { const [h,t]=await Promise.all([fetch("/api/admin/health",{headers}),fetch("/api/admin/tenants?limit=50&q="+encodeURIComponent(query)+"&status="+encodeURIComponent(status),{headers})]); const rejected=[h,t].find(response=>!response.ok);if(rejected){if(rejected.status===401||rejected.status===403)throw new Error("Admin key rejected. Check the key and try again.");if(rejected.status===503)throw new Error("Admin access is not configured on the server. Set ADMIN_API_KEY in Cloudflare Pages.");throw new Error("Admin data could not be loaded. Try again.");}setHealth((await h.json()) as Health);setTenants(((await t.json()) as TenantsResponse).tenants); } catch(e){setError(e instanceof Error?e.message:"Unable to load admin data.");} },[key,headers,query,status]);
 useEffect(()=>{queueMicrotask(()=>{try{if(localStorage.getItem(REMEMBER_KEY_STORAGE)==="true"){setRememberKey(true);setKey(localStorage.getItem(ADMIN_KEY_STORAGE)??"");}}catch{setError("Browser storage is unavailable. You can still enter the admin key for this session.");}});},[]);
 useEffect(()=>{queueMicrotask(()=>{void load();});},[load]);
 const updateKey=(value:string)=>{setKey(value);setError("");try{if(rememberKey&&value.trim())localStorage.setItem(ADMIN_KEY_STORAGE,value.trim());else localStorage.removeItem(ADMIN_KEY_STORAGE);}catch{setError("Could not update browser storage. The key remains available for this session.");}};
 const toggleRemember=(enabled:boolean)=>{setRememberKey(enabled);try{if(enabled){localStorage.setItem(REMEMBER_KEY_STORAGE,"true");if(key.trim())localStorage.setItem(ADMIN_KEY_STORAGE,key.trim());}else{localStorage.removeItem(REMEMBER_KEY_STORAGE);localStorage.removeItem(ADMIN_KEY_STORAGE);}}catch{setRememberKey(false);setError("Could not access browser storage. The key will not be remembered.");}};
 const lockAndClearKey=()=>{setKey("");setRememberKey(false);setShowKey(false);setHealth(null);setTenants([]);setIssued(null);setError("");try{localStorage.removeItem(ADMIN_KEY_STORAGE);localStorage.removeItem(REMEMBER_KEY_STORAGE);}catch{setError("The key was cleared for this session, but browser storage could not be cleared.");}};
 const action=async(tenantId:string,action:string,statusOverride?:string)=>{ if(!confirm("Confirm support action: "+action+"?")) return; const response=await fetch("/api/admin/support",{method:"POST",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify({tenantId,action,...(statusOverride?{status:statusOverride}:{})})}); if(!response.ok){setError("Support action failed.");return;} void load(); };
 const generate=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();setError("");setIssued(null);setCopied(false);setGenerating(true);try{const response=await fetch("/api/admin/provision",{method:"POST",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify({label:clientLabel,client_email:clientEmail,plan,expires_in_days:expiresInDays,quota_total:quotaTotal,locale})});const result=await response.json() as {success?:boolean;error?:string;issued?:IssuedTenant[]};if(!response.ok||!result.success||!result.issued?.[0])throw new Error(result.error||"Unable to generate client key.");setIssued(result.issued[0]);void load();}catch(caught){setError(caught instanceof Error?caught.message:"Unable to generate client key.");}finally{setGenerating(false);}};
 const copyKey=async(includeLink=false)=>{if(!issued)return;try{await navigator.clipboard.writeText(includeLink?`${issued.access_key}\n${STUDIO_URL}`:issued.access_key);setCopied(true);setError("");}catch{setError("Could not copy to clipboard. Select and copy the key manually.");}};
 const statusBanner=error?{message:error,background:"#fef2f2",color:"#991b1b",border:"#fecaca"}:!key.trim()?{message:"Enter your admin key to unlock tenant management and key generation.",background:"#eff6ff",color:"#1e40af",border:"#bfdbfe"}:null;
 return <main dir="ltr" style={{minHeight:"100vh",background:"#fff",color:"#102a5c",fontFamily:"Arial, sans-serif",padding:24}}>
  <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"2px solid #2563EB",paddingBottom:18}}>
   <div><IDMark size={30} small /><span style={{marginLeft:10,fontWeight:700}}>Owner Admin & Support</span><small style={{display:"block",color:"#2563EB"}}>{IDESIGN_STUDIO_CONFIG.websiteLabel} · {IDESIGN_STUDIO_CONFIG.email} · {IDESIGN_STUDIO_CONFIG.phoneLabel}</small></div>
   <div style={{display:"grid",gap:8}}>
    <label>Admin key <span style={{display:"inline-flex",marginLeft:8}}><input type={showKey?"text":"password"} autoComplete="off" value={key} onChange={e=>updateKey(e.target.value)} placeholder="Enter your Cloudflare admin key" style={{padding:8,border:"1px solid #2563EB"}} /><button type="button" onClick={()=>setShowKey(value=>!value)} aria-label={showKey?"Hide admin key":"Show admin key"} style={{padding:"0 10px",border:"1px solid #2563EB"}}>{showKey?"Hide":"Show"}</button></span></label>
    <div style={{display:"flex",gap:14,alignItems:"center",flexWrap:"wrap"}}>
     <label style={{fontSize:13}}><input type="checkbox" checked={rememberKey} onChange={e=>toggleRemember(e.target.checked)} /> Remember in this browser</label>
     <button type="button" onClick={lockAndClearKey} style={{padding:"6px 10px",border:"1px solid #94a3b8",borderRadius:6}}>Lock / Clear Key</button>
    </div>
   </div>
  </header>
  {statusBanner&&<p role="status" aria-live="polite" style={{padding:12,border:`1px solid ${statusBanner.border}`,borderRadius:8,background:statusBanner.background,color:statusBanner.color}}>{statusBanner.message}</p>}
  <section style={{maxWidth:900,margin:"24px 0",padding:20,border:"1px solid #bfdbfe",borderRadius:12}}>
   <h2 style={{margin:"0 0 16px",fontSize:20,fontWeight:700}}>Generate Client Key</h2>
   <form onSubmit={generate} style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:12}}>
    <label>Client / label<input required maxLength={120} value={clientLabel} onChange={e=>setClientLabel(e.target.value)} style={{display:"block",width:"100%",padding:8,border:"1px solid #bfdbfe"}} /></label>
    <label>Client email<input type="email" maxLength={254} value={clientEmail} onChange={e=>setClientEmail(e.target.value)} style={{display:"block",width:"100%",padding:8,border:"1px solid #bfdbfe"}} /></label>
    <label>Plan<input required maxLength={40} pattern="[A-Za-z0-9_-]+" value={plan} onChange={e=>setPlan(e.target.value)} style={{display:"block",width:"100%",padding:8,border:"1px solid #bfdbfe"}} /></label>
    <label>Expires in days<input type="number" min={1} max={3650} required value={expiresInDays} onChange={e=>setExpiresInDays(Number(e.target.value))} style={{display:"block",width:"100%",padding:8,border:"1px solid #bfdbfe"}} /></label>
    <label>Quota (0 = unlimited)<input type="number" min={0} max={1000000000} required value={quotaTotal} onChange={e=>setQuotaTotal(Number(e.target.value))} style={{display:"block",width:"100%",padding:8,border:"1px solid #bfdbfe"}} /></label>
    <label>Default locale<select value={locale} onChange={e=>setLocale(e.target.value)} style={{display:"block",width:"100%",padding:8,border:"1px solid #bfdbfe"}}><option value="en">English (LTR)</option><option value="ar">العربية (RTL)</option></select></label>
    <button type="submit" disabled={generating||!key.trim()||!!error} style={{alignSelf:"end",padding:"10px 16px",borderRadius:8,background:"#1D4ED8",color:"#fff",fontWeight:700,opacity:generating||!key.trim()||!!error?0.6:1}}>{generating?"Generating…":"Generate Client Key"}</button>
   </form>
   {issued&&<div role="status" aria-live="polite" style={{marginTop:18,padding:18,border:"2px solid #16a34a",borderRadius:10,background:"#f0fdf4"}}>
    <strong style={{fontSize:18}}>Client key created — copy it now.</strong>
    <p style={{margin:"8px 0",fontSize:16,fontWeight:700}}>{issued.label||"Client"}</p>
    <p style={{margin:"8px 0"}}>Plan: {issued.plan} · Quota: {issued.quota_total===0?"Unlimited":issued.quota_total} · Locale: {issued.locale.toUpperCase()}</p>
    <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
     <code style={{overflowWrap:"anywhere",padding:12,fontSize:16,fontWeight:700,background:"#fff",border:"1px solid #86efac"}}>{issued.access_key}</code>
     <button type="button" onClick={()=>void copyKey()} style={{padding:"10px 14px",border:"1px solid #16a34a",borderRadius:6,fontWeight:700}}>{copied?"Copied":"Copy Key"}</button>
     <button type="button" onClick={()=>void copyKey(true)} style={{padding:"10px 14px",border:"1px solid #16a34a",borderRadius:6,fontWeight:700}}>Copy Key + Link</button>
    </div>
    <p style={{marginBottom:0,fontWeight:600}}>Studio: <a href={STUDIO_URL} target="_blank" rel="noreferrer" style={{color:"#1D4ED8",textDecoration:"underline"}}>{STUDIO_URL}</a></p>
   </div>}
  </section>
  {health && <section style={{display:"flex",gap:12,flexWrap:"wrap",margin:"24px 0"}}>{[
   ["Active tenants",health.tenants.active],["Expired / revoked",health.tenants.expired+health.tenants.revoked],["Products",health.products.total],["Generated",health.products.generated],["Remaining",health.products.remaining]
  ].map(([label,value])=><div key={String(label)} style={{border:"1px solid #bfdbfe",borderRadius:10,padding:14,minWidth:130}}><small>{label}</small><strong style={{display:"block",fontSize:25,color:"#1D4ED8"}}>{value}</strong></div>)}</section>}
  <section style={{display:"flex",gap:8,marginBottom:14}}><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search label, brand or industry" /><select value={status} onChange={e=>setStatus(e.target.value)}><option value="">All statuses</option><option value="active">Active</option><option value="revoked">Revoked</option></select><button onClick={()=>void load()}>Search</button></section>
  <section style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["Customer","Brand","Status","Products","Queue","Support"].map(x=><th key={x} style={{textAlign:"left",padding:10,borderBottom:"1px solid #bfdbfe"}}>{x}</th>)}</tr></thead><tbody>{tenants.map(t=><tr key={t.id}><td style={{padding:10}}>{t.label||"Untitled"}<small style={{display:"block"}}>{t.id}</small></td><td>{t.locked_brand_name||"Not locked"}<small style={{display:"block"}}>{t.locked_industry||""}</small></td><td>{t.status}</td><td>{t.generated_products}/{t.total_products}</td><td>{t.brand_locked?"Locked":"Open"}</td><td><button onClick={()=>void action(t.id,"reset_queue")}>Reset queue</button> <button onClick={()=>void action(t.id,"set_status",t.status==="active"?"revoked":"active")}>{t.status==="active"?"Revoke":"Activate"}</button> <button onClick={()=>void action(t.id,"unlock_brand")}>Unlock brand</button> <button onClick={()=>void action(t.id,"clear_generation_lease")}>Clear generation lease</button></td></tr>)}</tbody></table></section>
 </main>;
}
