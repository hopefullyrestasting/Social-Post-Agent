import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PostCraft Admin | iDesign",
  description:
    "Administer PostCraft client keys, tenant quotas, brand locks, and studio access.",
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
