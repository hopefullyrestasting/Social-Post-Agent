import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Social Post Agent | مخزن الرحمة - Open Pomelli",
  description: "نظام أتمتة وإنتاج منشورات التواصل الاجتماعي لـ مخزن الرحمة - مستوحى من Pomelli",
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
