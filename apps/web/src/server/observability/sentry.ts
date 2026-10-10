import * as Sentry from "@sentry/nextjs";

/** Sends a server error to Sentry when SENTRY_DSN is set; Sentry.init is skipped otherwise. */
export function report(e: unknown, ctx: Record<string, unknown>): void {
  if (!process.env["SENTRY_DSN"]) return;
  Sentry.captureException(e, { extra: ctx });
}
