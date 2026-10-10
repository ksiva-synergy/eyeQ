import * as Sentry from "@sentry/nextjs";

/**
 * Sentry on the server (Node and edge runtimes). Skipped cleanly without SENTRY_DSN.
 * Events carry ids, never phone numbers or other personal data (ground rule 11).
 */
export function register() {
  const dsn = process.env["SENTRY_DSN"];
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env["APP_ENV"] ?? "local",
    release: process.env["VERCEL_GIT_COMMIT_SHA"],
    tracesSampleRate: Number(process.env["SENTRY_TRACES_SAMPLE_RATE"] ?? 0),
    sendDefaultPii: false,
  });
}

export const onRequestError = Sentry.captureRequestError;
