import { createHash } from "node:crypto";
import type { PrismaClient } from "@eyeq/db";
import { log } from "../observability/log";
import { processEvent, type GrantResult } from "./process";
import { verifyWebhookSignature, type Razorpay } from "./razorpay";

/**
 * POST /api/webhooks/razorpay (plan section 7). The order of work is the plan's:
 *   1. verify X-Razorpay-Signature over the raw body; a bad or missing one is a 401, a log
 *      line and a Sentry event, and nothing is stored;
 *   2. store the event in payment_events, unique on (provider, x-razorpay-event-id), and
 *      answer 2xx only once it is stored (a failed insert is a 500, so Razorpay retries);
 *   3. answer 200 as soon as that row is committed, and process after the response
 *      (Next's after(), Vercel's waitUntil). Processing re-fetches from Razorpay's API, and
 *      Razorpay counts a reply slower than 5 s as a failure (24 hours of failures disable
 *      the webhook), so the reply never waits on it. A failure is recorded on the row; the
 *      5-minute sweep retries anything left unprocessed.
 * A repeat delivery of a processed event is a 200 that changes nothing.
 */
export interface WebhookDeps {
  secret: string | undefined;
  db: PrismaClient; // eyeq_service
  razorpay: Razorpay | undefined;
  report: (e: unknown, ctx: Record<string, unknown>) => void;
  onGrant: (r: GrantResult) => Promise<void>;
  /** Runs work after the response is sent: next/server's after() in the route. */
  defer: (work: () => Promise<void>) => void;
  now?: () => Date;
}

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

export class WebhookSignatureRejected extends Error {
  constructor(reason: string) {
    super(`Razorpay webhook signature rejected: ${reason}`);
    this.name = "WebhookSignatureRejected";
  }
}

export async function handleRazorpayWebhook(req: Request, deps: WebhookDeps): Promise<Response> {
  if (!deps.secret) {
    log("error", "razorpay.webhook_unconfigured");
    return json({ code: "internal", message: "Webhook not configured." }, 500);
  }
  const raw = await req.text();
  const signature = req.headers.get("x-razorpay-signature");
  if (!verifyWebhookSignature(raw, signature, deps.secret)) {
    const reason = signature ? "mismatch" : "missing";
    log("warn", "razorpay.webhook_bad_signature", { reason, bytes: raw.length });
    deps.report(new WebhookSignatureRejected(reason), { route: "/api/webhooks/razorpay" });
    return json({ code: "unauthenticated", message: "Bad signature." }, 401);
  }
  let payload: { event?: unknown };
  try {
    payload = JSON.parse(raw) as { event?: unknown };
  } catch {
    log("warn", "razorpay.webhook_not_json");
    return json({ code: "invalid_json", message: "Body is not JSON." }, 400);
  }
  const type = typeof payload.event === "string" ? payload.event : null;
  // Razorpay sends a unique id per event; without it, the body's hash dedupes exact repeats.
  const externalId =
    req.headers.get("x-razorpay-event-id") ??
    `sha256:${createHash("sha256").update(raw).digest("hex")}`;

  let stored: { id: string; new: boolean; processed: boolean };
  try {
    const rows = await deps.db.$queryRaw<{ r: typeof stored }[]>`
      select store_payment_event('razorpay', ${externalId}, ${type}, ${raw}::jsonb, ${deps.now?.() ?? new Date()}) as r`;
    stored = rows[0]!.r;
  } catch (e) {
    log("error", "razorpay.webhook_store_failed", { externalId, type, error: String(e) });
    deps.report(e, { route: "/api/webhooks/razorpay", externalId });
    return json({ code: "internal", message: "Not stored." }, 500);
  }
  log("info", "razorpay.webhook", { externalId, type, eventId: stored.id, new: stored.new });
  if (stored.processed) return json({ ok: true, replay: true });

  if (!deps.razorpay) {
    log("error", "razorpay.keys_missing", { eventId: stored.id });
    return json({ ok: true, stored: true });
  }
  const razorpay = deps.razorpay;
  deps.defer(async () => {
    const out = await processEvent({ db: deps.db, razorpay, now: deps.now }, stored.id, "webhook");
    if (out.status === "processed") {
      for (const r of out.results) {
        if (!r.granted) continue;
        try {
          await deps.onGrant(r);
        } catch (e) {
          log("warn", "razorpay.on_grant_failed", { eventId: stored.id, error: String(e) });
        }
      }
    }
    if (out.status === "failed") deps.report(new Error(out.error), { eventId: stored.id, type });
  });
  return json({ ok: true, stored: true });
}
