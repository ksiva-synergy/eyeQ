import type { Channel, Claimed, SendResult } from "./channels";

export type Fetch = typeof fetch;

/**
 * Email through Resend's HTTP API (POST /emails). The address travels in the row's data
 * (a receipt carries the checkout email, phase 7); nothing looks it up here. The row id is
 * the Idempotency-Key, so a retried row is not sent twice within Resend's 24 hours.
 * Used for receipts (phase 7). Without RESEND_API_KEY and EMAIL_FROM a row is skipped
 * with `email_not_configured`.
 */
export function resendChannel(
  cfg: { key: string; from: string } | undefined,
  fetcher: Fetch = fetch,
): Channel {
  return {
    async send(n: Claimed, text): Promise<SendResult> {
      const to = typeof n.data["email"] === "string" ? (n.data["email"] as string) : null;
      if (!to) return { outcome: "skipped", error: "no_address" };
      // Without Resend, a receipt is skipped and recorded, not retried (phase 7).
      if (!cfg) return { outcome: "skipped", error: "email_not_configured" };
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
