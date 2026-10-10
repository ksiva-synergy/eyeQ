import localFont from "next/font/local";

// Self-hosted (plan section 8). The CSS variables are read by @eyeq/ui/theme.css
// (--font-display / --font-body fall back to the family names if unset).
export const display = localFont({
  src: [
    { path: "../fonts/BarlowCondensed-Bold.woff2", weight: "700", style: "normal" },
    { path: "../fonts/BarlowCondensed-ExtraBold.woff2", weight: "800", style: "normal" },
  ],
  variable: "--eyeq-font-display",
  display: "swap",
  fallback: ["Impact", "Arial Narrow", "sans-serif"],
});

export const body = localFont({
  src: [{ path: "../fonts/Manrope-Variable.woff2", weight: "200 800", style: "normal" }],
  variable: "--eyeq-font-body",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});
