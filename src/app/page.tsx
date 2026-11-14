import Link from "next/link";

export default function Home() {
  return (
    <main dir="rtl" className="flex min-h-screen items-center justify-center bg-[#071d3b] px-5 text-white">
      <section className="w-full max-w-2xl rounded-3xl border border-white/15 bg-white/5 p-8 text-center shadow-2xl sm:p-12">
        <p className="text-sm font-semibold text-cyan-200">Social Post Agent</p>
        <h1 className="mt-4 text-4xl font-black">مخزن الرحمة</h1>
        <p className="mt-4 text-lg leading-8 text-slate-200">إدارة منتجات مستحضرات التجميل والعناية الشخصية والعطور والمستلزمات الطبية، وتجهيز محتوى تسويقي دقيق للمنتجات.</p>
        <Link href="/dashboard" className="mt-8 inline-flex rounded-xl bg-emerald-500 px-7 py-3 font-extrabold text-white transition hover:bg-emerald-400">فتح لوحة التحكم</Link>
        <p className="mt-6 text-sm text-slate-300">للتواصل والطلبات: 01000017548</p>
      </section>
    </main>
  );
}
