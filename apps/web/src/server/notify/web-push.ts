import webpush, { type PushSubscription } from "web-push";
import type { Channel, Claimed, SendResult } from "./channels";

export type WebPushSender = (
  subscription: PushSubscription,
  payload: string,
) => Promise<{ statusCode: number }>;

type Vapid = { publicKey: string; privateKey: string; subject: string };

/** The options every push is sent with. */
export function pushOptions(vapid: Vapid): webpush.RequestOptions {
  return {
    vapidDetails: vapid,
    TTL: 6 * 60 * 60, // a reminder older than six hours is stale
    urgency: "normal",
  };
}

/** The real sender: web-push with the app's VAPID keys. */
export function vapidSender(vapid: Vapid): WebPushSender {
  return (subscription, payload) =>
    webpush.sendNotification(subscription, payload, pushOptions(vapid));
}

function statusOf(e: unknown): number {
  const s = (e as { statusCode?: unknown })?.statusCode;
  return typeof s === "number" ? s : 0;
}

/**
 * Web push (D29). Sends to every web subscription the athlete has; Expo tokens wait for
 * phase 9. 404 and 410 mean the subscription is gone: it is disabled and not retried.
 * A 429, a 5xx or a network failure is retried with backoff. With no live web
 * subscription the row is skipped (`no_device`); the in-app feed still shows it.
 */
export function webPushChannel(send: WebPushSender | undefined): Channel {
  return {
    async send(n: Claimed, text): Promise<SendResult> {
      const targets = n.targets.filter((t) => t.platform === "web");
      if (targets.length === 0) return { outcome: "skipped", error: "no_device" };
      if (!send) return { outcome: "retry", error: "web_push_not_configured" };
      const payload = JSON.stringify({
        title: text.title,
        body: text.body,
        url: text.url,
        id: n.id,
      });
      let sent = 0;
      let retry: string | null = null;
      let failed: string | null = null;
      const gone: string[] = [];
      for (const t of targets) {
        let sub: PushSubscription;
        try {
          sub = JSON.parse(t.token) as PushSubscription;
        } catch {
          gone.push(t.id);
          continue;
        }
        try {
          await send(sub, payload);
          sent++;
        } catch (e) {
          const status = statusOf(e);
          if (status === 404 || status === 410) gone.push(t.id);
          else if (status === 0 || status === 429 || status >= 500) retry = `http_${status}`;
          else failed = `http_${status}`;
        }
      }
      const result: SendResult = sent
        ? { outcome: "sent" }
        : retry
          ? { outcome: "retry", error: retry }
          : failed
            ? { outcome: "failed", error: failed }
            : { outcome: "skipped", error: "no_device" };
      return gone.length ? { ...result, goneTargets: gone } : result;
    },
  };
}
