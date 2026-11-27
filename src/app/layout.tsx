import type { Metadata } from "next";
import { IDESIGN_STUDIO_CONFIG } from "@/lib/al-rahma/brand-core";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(IDESIGN_STUDIO_CONFIG.websiteUrl),
  title: {
    default: "PostCraft by iDesign",
    template: "%s | PostCraft",
  },
  description:
    "PostCraft by iDesign is a multi-tenant social content studio for brands, agencies, designers, and product sellers. Create polished product showcases in Arabic RTL or English LTR.",
  keywords: [
    "PostCraft",
    "iDesign",
    "social media design",
    "product showcase",
    "brand content",
    "ad creator",
    "Arabic social media",
    "RTL design",
    "LTR design",
  ],
  openGraph: {
    type: "website",
    locale: "en_US",
    alternateLocale: ["ar_EG"],
    url: IDESIGN_STUDIO_CONFIG.websiteUrl,
    siteName: IDESIGN_STUDIO_CONFIG.productName,
    title: "PostCraft by iDesign",
    description:
      "A multi-tenant social content studio for brands, agencies, designers, and product sellers.",
  },
  twitter: {
    card: "summary",
    title: "PostCraft by iDesign",
    description:
      "Create branded RTL and LTR product showcases for social media.",
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: IDESIGN_STUDIO_CONFIG.faviconUrl,
    apple: IDESIGN_STUDIO_CONFIG.faviconUrl,
  },
  manifest: "/site.webmanifest",
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
