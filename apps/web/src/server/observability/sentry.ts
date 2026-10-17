import * as Sentry from "@sentry/nextjs";
import { after } from "next/server";

/** How long to wait for Sentry to accept a queued event before giving up. */
const FLUSH_MS = 2000;

/**
 * Sends a server error to Sentry when SENTRY_DSN is set; Sentry.init is skipped otherwise.
 *
 * `captureException` only queues the event. On Vercel a function is frozen once its
 * response is sent, so a queued event would be dropped. The flush is handed to `after()`,
 * which runs it after the response while Vercel keeps the invocation alive (`waitUntil`),
 * so the error response is not delayed. Outside a request scope `after()` throws, and the
 * flush is started directly instead.
 */
export function report(e: unknown, ctx: Record<string, unknown>): void {
  if (!process.env["SENTRY_DSN"]) return;
  Sentry.captureException(e, { extra: ctx });
  try {
    after(() => Sentry.flush(FLUSH_MS));
  } catch {
    void Sentry.flush(FLUSH_MS);
  }
}
