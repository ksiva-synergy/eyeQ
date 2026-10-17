"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { t } from "@eyeq/i18n";
import { ErrorCard } from "@eyeq/ui/web";

/**
 * Any athlete page that fails to load: say so, offer to try again, and report it to
 * Sentry (a caught render error never reaches the SDK's global handlers).
 */
export default function AthleteError({ error, retry }: { error: Error; retry: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return <ErrorCard message={t("today.loadError")} onRetry={retry} />;
}
