"use client";

import { AlRahmaStudio } from "@/components/al-rahma/AlRahmaStudio";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      {/* Top Navbar */}
      <header className="sticky top-0 z-50 bg-white/85 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
              ر
            </div>
            <div>
              <span className="font-extrabold text-base text-slate-900">مخزن الرحمة</span>
              <span className="text-xs text-slate-500 font-medium mr-2">| Social Post Agent</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              جاهز للنشر على Cloudflare Pages
            </span>
          </div>
        </div>
      </header>

      {/* Main Studio */}
      <AlRahmaStudio />
    </main>
  );
}
