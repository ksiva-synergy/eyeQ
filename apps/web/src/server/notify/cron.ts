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

/** Thrown by a forced-failure check run (`?fail=1`), so it is easy to find in logs and Sentry. */
export class ForcedCronFailure extends Error {
  constructor() {
    super("Forced failure: cron failure-path check (?fail=1)");
    this.name = "ForcedCronFailure";
  }
}

/**
 * GET /api/cron/dispatch (plan section 7): refused without the cron secret (Vercel Cron
 * sends it as `Authorization: Bearer $CRON_SECRET`), and refused when no secret is set at
 * all, so an unconfigured deployment is never open. A failed run answers 500, which
 * Vercel's cron and function logs show, and is reported to Sentry.
 *
 * `?fail=1` makes an authorised call fail on purpose without running the dispatcher, to
 * check the failure path on staging. It is honoured only where `allowForcedFailure` is set
 * (the route sets it when APP_ENV is not production), and only after the secret check.
 */
export async function handleCron(
  req: Request,
  deps: {
    secret: string | undefined;
    run: () => Promise<DispatchResult | Record<string, unknown>>;
    allowForcedFailure?: boolean;
    /** Names the job in log lines (`cron.<job>`) and its route; the dispatcher by default. */
    job?: string;
  },
): Promise<Response> {
  const job = deps.job ?? "dispatch";
  const route = `/api/cron/${job}`;
  if (!hasCronSecret(req, deps.secret)) {
    log("warn", "cron.refused", { route });
    return Response.json(
      { code: "unauthenticated", message: "Not allowed." },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }
  const forced =
    deps.allowForcedFailure === true && new URL(req.url).searchParams.get("fail") === "1";
  const started = Date.now();
  try {
    if (forced) throw new ForcedCronFailure();
    const result = await deps.run();
    log("info", `cron.${job}`, { ...result, ms: Date.now() - started });
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    log("error", `cron.${job}_failed`, {
      ms: Date.now() - started,
      error: e instanceof Error ? e.message : String(e),
    });
    report(e, { route });
    return Response.json(
      { code: "internal", message: job === "dispatch" ? "Dispatch failed." : "Job failed." },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
