import type React from "react";
import type { Metadata, Viewport } from "next";
import { BRAND_NAME } from "@eyeq/config";
import { t } from "@eyeq/i18n";
import { body, display } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: BRAND_NAME,
  description: t("app.description"),
};

// No maximum-scale: pinch zoom stays on (accessibility floor, rule 13).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// No data-theme here: athlete pages follow the OS until the athlete picks a theme
// (COMPONENTS 1). The public layout pins dark and the admin layout pins light.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
