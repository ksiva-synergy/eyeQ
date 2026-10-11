import type React from "react";
import type { Metadata } from "next";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** The coach's "Preview as athlete": the athlete's full-screen player, outside the admin shell. */
export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh flex-col bg-ground text-text-primary">{children}</div>;
}
