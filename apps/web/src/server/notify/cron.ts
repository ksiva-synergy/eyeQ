import { timingSafeEqual } from "node:crypto";
import { log } from "../observability/log";
import { report } from "../observability/sentry";
import type { DispatchResult } from "./dispatch";

/** Whether the request carries the cron secret, compared in constant time. */
export function hasCronSecret(req: Request, secret: string | undefined): boolean {
  if (!secret) return false;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return given.length === want.length && timingSafeEqual(given, want);
}

/**
 * GET /api/cron/dispatch (plan section 7): refused without the cron secret (Vercel Cron
 * sends it as `Authorization: Bearer $CRON_SECRET`), and refused when no secret is set at
 * all, so an unconfigured deployment is never open. A failed run answers 500, which
 * Vercel's cron and function logs show, and is reported to Sentry.
 */
export async function handleCron(
  req: Request,
  deps: { secret: string | undefined; run: () => Promise<DispatchResult> },
): Promise<Response> {
  if (!hasCronSecret(req, deps.secret)) {
    log("warn", "cron.refused", { route: "/api/cron/dispatch" });
    return Response.json(
      { code: "unauthenticated", message: "Not allowed." },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }
  const started = Date.now();
  try {
    const result = await deps.run();
    log("info", "cron.dispatch", { ...result, ms: Date.now() - started });
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    log("error", "cron.dispatch_failed", {
      ms: Date.now() - started,
      error: e instanceof Error ? e.message : String(e),
    });
    report(e, { route: "/api/cron/dispatch" });
    return Response.json(
      { code: "internal", message: "Dispatch failed." },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
