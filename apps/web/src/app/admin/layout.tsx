import type React from "react";
import type { Metadata } from "next";
import { AdminShell } from "@/components/shell/AdminShell";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Gating by `admins` arrives in phase 4; for now the layout renders without a session.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
