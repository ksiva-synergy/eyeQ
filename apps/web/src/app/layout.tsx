import type React from "react";
import type { Metadata } from "next";
import { BRAND_NAME } from "@eyeq/config";
import "./globals.css";

// Fonts (Barlow Condensed, Manrope) are self-hosted in phase 3 (plan section 8).

export const metadata: Metadata = {
  title: BRAND_NAME,
  description: "Daily vision training for athletes.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
