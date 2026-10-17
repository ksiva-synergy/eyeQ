import { after } from "next/server";
import { serviceDb } from "@/server/db";
import { env } from "@/server/env";
import { report } from "@/server/observability/sentry";
import { purchaseCompleted, razorpay } from "@/server/payments/deps";
import { handleRazorpayWebhook } from "@/server/payments/webhook";

/** Razorpay webhooks. Verified by X-Razorpay-Signature over the raw body, not a session. */
export const maxDuration = 30;

export function POST(req: Request): Promise<Response> {
  return handleRazorpayWebhook(req, {
    secret: env.razorpayWebhookSecret(),
    db: serviceDb(),
    razorpay: razorpay(),
    report,
    onGrant: purchaseCompleted,
    // Processing (with its Razorpay re-fetch) runs after the reply; the sweep backs it up.
    defer: (work) => after(work),
  });
}
