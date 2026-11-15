import type { Metadata } from "next";
import "./globals.css";
import { AL_RAHMA_BRAND_CONFIG } from "@/lib/al-rahma/brand-core";

export const metadata: Metadata = {
  title: `Social Post Agent | ${AL_RAHMA_BRAND_CONFIG.brandName}`,
  description: `نظام أتمتة وإنتاج منشورات التواصل الاجتماعي لـ ${AL_RAHMA_BRAND_CONFIG.brandName}`,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Tajawal:wght@400;500;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased selection:bg-emerald-100 selection:text-emerald-900">
        {children}
      </body>
    </html>
  );
}
