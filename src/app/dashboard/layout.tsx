import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PostCraft Studio | iDesign",
  description:
    "Create and manage branded social product designs in RTL or LTR with PostCraft by iDesign.",
  robots: { index: true, follow: true },
};

export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
