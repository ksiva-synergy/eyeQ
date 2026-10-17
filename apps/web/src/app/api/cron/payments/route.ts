import { serviceDb } from "@/server/db";
import { env } from "@/server/env";
import { handleCron } from "@/server/notify/cron";
import { purchaseCompleted, razorpay } from "@/server/payments/deps";
import { sweepEvents } from "@/server/payments/process";

/**
 * Vercel Cron, every 5 minutes (vercel.json): processes any Razorpay event the webhook
 * request stored but did not finish (plan phase 7). Entitlements past their end are ended
 * by pg_cron's hourly entitlement-expiry job, not here.
 */
export const maxDuration = 60;

export function GET(req: Request) {
  return handleCron(req, {
    secret: env.cronSecret(),
    allowForcedFailure: env.str("APP_ENV") !== "production",
    job: "payments",
    run: async () => {
      const client = razorpay();
      if (!client) return { due: 0, processed: 0, failed: 0, configured: false };
      return sweepEvents({ db: serviceDb(), razorpay: client }, purchaseCompleted);
    },
  });
}
