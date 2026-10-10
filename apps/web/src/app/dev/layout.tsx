import type React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { env } from "@/server/env";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Development tooling behind DEV_GALLERY (see server/env.ts): on locally, in CI and on
 * staging; off for real production.
 */
export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (!env.devGallery()) notFound();
  return children;
}
