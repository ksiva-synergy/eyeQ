import type React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Development tooling. Served locally, in CI and on Vercel preview deployments;
 * never on a Vercel production deployment (VERCEL_ENV is set by Vercel itself).
 */
export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (process.env["VERCEL_ENV"] === "production") notFound();
  return children;
}
