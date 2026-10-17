import type { Channel, Claimed, SendResult } from "./channels";

export type Fetch = typeof fetch;

/**
 * Email through Resend's HTTP API (POST /emails). The address travels in the row's data
 * (a receipt carries the checkout email, phase 7); nothing looks it up here. The row id is
 * the Idempotency-Key, so a retried row is not sent twice within Resend's 24 hours.
 * Used for receipts (phase 7). Without RESEND_API_KEY and EMAIL_FROM: in production the
 * row stays queued and Sentry hears about it; elsewhere it is skipped (`email_not_configured`).
 */
export class EmailNotConfigured extends Error {
  constructor() {
    super("Receipts are queued but RESEND_API_KEY or EMAIL_FROM is not set in production");
    this.name = "EmailNotConfigured";
  }
}

export function resendChannel(
  cfg: { key: string; from: string } | undefined,
  fetcher: Fetch = fetch,
  opts: {
    production?: boolean;
    report?: (e: unknown, ctx: Record<string, unknown>, o?: { fingerprint?: string[] }) => void;
    /** Whether this report may go out now (at most once an hour across runs). */
    mayReport?: () => Promise<boolean>;
  } = {},
): Channel {
  let reported = false;
  return {
    async send(n: Claimed, text): Promise<SendResult> {
      const to = typeof n.data["email"] === "string" ? (n.data["email"] as string) : null;
      if (!to) return { outcome: "skipped", error: "no_address" };
      if (!cfg) {
        // Production: a receipt is owed, so it stays queued until the key is set, and the
        // missing setting is reported, at most once an hour. Staging and local: skipped.
        if (opts.production) {
          if (!reported) {
            reported = true;
            if (await (opts.mayReport?.() ?? Promise.resolve(true)))
              // One stable Sentry issue, whatever the row or stack.
              opts.report?.(
                new EmailNotConfigured(),
                { notificationId: n.id, kind: n.kind },
                { fingerprint: ["email-not-configured"] },
              );
          }
          return { outcome: "retry", error: "email_not_configured", hold: true };
        }
        return { outcome: "skipped", error: "email_not_configured" };
      }
      let res: Response;
      try {
        res = await fetcher("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            authorization: `Bearer ${cfg.key}`,
            "content-type": "application/json",
            "idempotency-key": `notification-${n.id}`,
          },
          body: JSON.stringify({ from: cfg.from, to, subject: text.title, text: text.body }),
        });
      } catch {
        return { outcome: "retry", error: "network" };
      }
      if (res.ok) return { outcome: "sent" };
      if (res.status === 429 || res.status >= 500)
        return { outcome: "retry", error: `http_${res.status}` };
      return { outcome: "failed", error: `http_${res.status}` };
    },
  };
}
