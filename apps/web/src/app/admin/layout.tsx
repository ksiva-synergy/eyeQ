import type React from "react";
import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminShell } from "@/components/shell/AdminShell";
import { requireAdmin } from "@/server/auth/admin";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Only coaches and owners see the admin shell (plan phase 4); the API checks again. */
async function AdminGate({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <AdminShell>{children}</AdminShell>;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div data-theme="light" className="min-h-dvh bg-ground" />}>
      <AdminGate>{children}</AdminGate>
    </Suspense>
  );
}
