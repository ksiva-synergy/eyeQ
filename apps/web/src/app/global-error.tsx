"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { BRAND_NAME } from "@eyeq/config";
import { t } from "@eyeq/i18n";
import { ErrorCard } from "@eyeq/ui/web";
import { body, display } from "./fonts";
import "./globals.css";

/**
 * The last-resort boundary: an error in the root layout, or one no nearer `error.tsx`
 * caught. It replaces the root layout, so it brings its own document, styles and fonts.
 * The error is reported to Sentry here, because a boundary that catches it stops it from
 * reaching the SDK's global handlers.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en" className={`${display.variable} ${body.variable} h-full`}>
      <body className="grid min-h-full place-items-center p-4">
        <title>{BRAND_NAME}</title>
        <ErrorCard className="w-full max-w-md" message={t("common.crashed")} onRetry={retry} />
      </body>
    </html>
  );
}
