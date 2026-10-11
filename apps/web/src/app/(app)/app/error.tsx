"use client";

import { t } from "@eyeq/i18n";
import { ErrorCard } from "@eyeq/ui/web";

/** Any athlete page that fails to load: say so, and offer to try again. */
export default function AthleteError({ reset }: { error: Error; reset: () => void }) {
  return <ErrorCard message={t("today.loadError")} onRetry={reset} />;
}
