import type { Metadata } from "next";
import { IDESIGN_STUDIO_CONFIG } from "@/lib/al-rahma/brand-core";
import "./globals.css";

export const metadata: Metadata = {
  title: `${IDESIGN_STUDIO_CONFIG.name} — ${IDESIGN_STUDIO_CONFIG.productName}`,
  description: `Basic Ad Studio by ${IDESIGN_STUDIO_CONFIG.name}: upload product photos, review details, and generate two ready-to-share designs per product without repeats.`,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Tajawal:wght@400;500;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-white text-slate-900 antialiased selection:bg-blue-100 selection:text-[#1D4ED8]">
        {children}
      </body>
    </html>
  );
}
