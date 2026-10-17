import { serviceDb } from "@/server/db";
import { env } from "@/server/env";
import { handleCron } from "@/server/notify/cron";
import { dispatch } from "@/server/notify/dispatch";
import { resendChannel } from "@/server/notify/email";
import { vapidSender, webPushChannel } from "@/server/notify/web-push";

/** Vercel Cron, every 5 minutes (vercel.json): drains the notification outbox. */
export const maxDuration = 60;

export function GET(req: Request) {
  return handleCron(req, {
    secret: env.cronSecret(),
    // `?fail=1` checks the failure path (500, logs, Sentry) on staging; never in production.
    allowForcedFailure: env.str("APP_ENV") !== "production",
    run: () => {
      const vapid = env.vapid();
      return dispatch({
        db: serviceDb(),
        channels: {
          push: webPushChannel(vapid ? vapidSender(vapid) : undefined),
          email: resendChannel(env.resend()),
        },
      });
    },
  });
}
