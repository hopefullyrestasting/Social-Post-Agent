"use client";
import { useEffect, useMemo, useState } from "react";

type Brand={id:string;name_arabic:string;name_english:string|null;slug:string;identity_status:string;product_count:number};
type Product={id:string;name_arabic:string;name_english:string|null;category:string|null;packaging_size:string|null;variant:string|null;verification_status:string;warehouse_stock_status:string;brand_arabic:string;brand_slug:string;image_url:string|null};
type Stats={products:number;brands:number;assets:number;campaigns:number;creatives:number;verified:number};
const PHONE="01000017548";
const statusLabel=(s:string)=>s==="verified"?"موثّق":s==="probable"?"محتمل":s==="unconfirmed"?"غير مؤكد":s==="discontinued"?"متوقف":"يحتاج مراجعة";
export default function DashboardPage(){
 const [brands,setBrands]=useState<Brand[]>([]),[products,setProducts]=useState<Product[]>([]),[stats,setStats]=useState<Stats|null>(null);
 const [q,setQ]=useState(""),[brand,setBrand]=useState(""),[status,setStatus]=useState(""),[loading,setLoading]=useState(true),[error,setError]=useState("");
 async function load(){
  setLoading(true);setError("");
  try{
   const [b,p,s]=await Promise.all([fetch("/api/db/brands").then(r=>r.json()),fetch("/api/db/products?limit=100").then(r=>r.json()),fetch("/api/db/stats").then(r=>r.json())]);
   if(!b.success||!p.success||!s.success)throw new Error(b.detail||p.detail||s.detail||"تعذر الاتصال بقاعدة البيانات");
   setBrands(b.brands);setProducts(p.products);setStats(s.stats);
  }catch(e){setError(String(e));}finally{setLoading(false);}
 }
 useEffect(()=>{load();},[]);
 const filtered=useMemo(()=>products.filter(p=>(!brand||p.brand_slug===brand)&&(!status||p.verification_status===status)&&(!q||[p.name_arabic,p.name_english,p.category,p.brand_arabic].some(v=>v?.toLowerCase().includes(q.toLowerCase())))),[products,brand,status,q]);
 return <main dir="rtl" className="min-h-screen bg-slate-50 text-slate-900">
  <header className="bg-[#071d3b] text-white"><div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5"><div><p className="text-sm text-cyan-200">نظام إدارة المحتوى التسويقي</p><h1 className="mt-1 text-2xl font-black">مخزن الرحمة</h1><p className="mt-1 text-sm text-slate-300">مستحضرات التجميل والعناية الشخصية والعطور والمستلزمات الطبية</p></div><a className="rounded-xl bg-emerald-500 px-4 py-3 font-bold text-white" href={`https://wa.me/2${PHONE}`}>واتساب {PHONE}</a></div></header>
  <div className="mx-auto max-w-7xl space-y-6 px-5 py-7">
   <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-extrabold">لوحة التحكم</h2><p className="text-sm text-slate-500">البيانات المعروضة تُقرأ مباشرة من قاعدة D1</p></div><button onClick={load} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold">تحديث البيانات ↻</button></div>
   {error&&<div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">تعذر تحميل بيانات قاعدة البيانات: {error}</div>}
   <section className="grid grid-cols-2 gap-3 md:grid-cols-6">{[{label:"إجمالي المنتجات",value:stats?.products??"—"},{label:"البراندات",value:stats?.brands??"—"},{label:"صور مرجعية",value:stats?.assets??"—"},{label:"موثّق بحثيًا",value:stats?.verified??"—"},{label:"الحملات",value:stats?.campaigns??"—"},{label:"التصميمات",value:stats?.creatives??"—"}].map(x=><div key={x.label} className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">{x.label}</p><p className="mt-2 text-2xl font-black">{x.value}</p></div>)}</section>
   <section className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="mb-4 font-extrabold">البراندات المسجلة</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{brands.map(b=><div key={b.id} className="rounded-xl border border-slate-200 p-3"><p className="font-bold">{b.name_arabic}</p><p className="text-xs text-slate-500">{b.name_english||b.slug}</p><p className="mt-2 text-sm"><b>{b.product_count}</b> منتج</p><p className="text-xs text-amber-700">{statusLabel(b.identity_status)}</p></div>)}</div></section>
   <section className="rounded-2xl border border-slate-200 bg-white p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h3 className="font-extrabold">كتالوج المنتجات</h3><span className="text-sm text-slate-500">المعروض: {filtered.length} من {products.length} منتج محمّل</span></div>
    <div className="mb-4 grid gap-3 md:grid-cols-3"><input value={q} onChange={e=>setQ(e.target.value)} placeholder="ابحث باسم المنتج أو التصنيف..." className="rounded-lg border border-slate-300 px-3 py-2"/><select value={brand} onChange={e=>setBrand(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2"><option value="">كل البراندات</option>{brands.map(b=><option key={b.id} value={b.slug}>{b.name_arabic}</option>)}</select><select value={status} onChange={e=>setStatus(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2"><option value="">كل حالات التحقق</option><option value="needs_verification">يحتاج مراجعة</option><option value="verified">موثّق</option><option value="probable">محتمل</option><option value="unconfirmed">غير مؤكد</option><option value="discontinued">متوقف</option></select></div>
    {loading?<p className="py-8 text-center text-slate-500">جاري تحميل المنتجات من D1...</p>:<div className="overflow-x-auto"><table className="w-full min-w-[760px] text-right text-sm"><thead><tr className="border-b bg-slate-50 text-slate-600"><th className="p-3">المنتج</th><th className="p-3">البراند</th><th className="p-3">التصنيف</th><th className="p-3">الحجم</th><th className="p-3">حالة المخزون</th><th className="p-3">التحقق</th></tr></thead><tbody>{filtered.map(p=><tr key={p.id} className="border-b last:border-0"><td className="p-3 font-bold">{p.name_arabic}<div className="text-xs font-normal text-slate-500">{p.name_english||""}</div></td><td className="p-3">{p.brand_arabic}</td><td className="p-3">{p.category||"—"}</td><td className="p-3">{p.packaging_size||"—"}</td><td className="p-3">{p.warehouse_stock_status||"غير محدد"}</td><td className="p-3"><span className="rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-800">{statusLabel(p.verification_status)}</span></td></tr>)}</tbody></table></div>}
   </section>
   <p className="text-center text-xs text-slate-500">للطلبات والاستفسار: {PHONE} · مخزن الرحمة</p>
  </div>
 </main>;
}
