import * as Sentry from "@sentry/nextjs";

/**
 * Sentry in the browser. The DSN is public by design (it can only submit events), so it
 * is the one NEXT_PUBLIC_ value; no secret is ever NEXT_PUBLIC_ (ground rule 12).
 */
const dsn = process.env["NEXT_PUBLIC_SENTRY_DSN"];
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env["NEXT_PUBLIC_APP_ENV"] ?? "local",
    tracesSampleRate: 0,
    sendDefaultPii: false,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
