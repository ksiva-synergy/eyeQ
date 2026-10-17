import "server-only";
import { serviceDb } from "../db";
import { env } from "../env";
import { capture } from "../observability/posthog";
import type { GrantResult } from "./process";
import { razorpayClient, type Razorpay } from "./razorpay";

/** The Razorpay client from the environment, or undefined when the keys are not set. */
export function razorpay(): Razorpay | undefined {
  const keys = env.razorpay();
  return keys ? razorpayClient(keys) : undefined;
}

/**
 * purchase_completed (plan phase 7): sent by whichever path made the grant (webhook,
 * refresh or sweep), once per payment, never on a replay, because only the first
 * payment_grants insert reports granted. Ids and product kind only (rule 11).
 */
export async function purchaseCompleted(r: GrantResult): Promise<void> {
  if (!r.granted || !r.user_id) return;
  await capture(r.user_id, "purchase_completed", {
    product_id: r.product_id ?? "",
    product_kind: r.product_kind ?? "",
    checkout_id: r.checkout_id ?? "",
    provider: "razorpay",
  });
}

export const paymentDb = serviceDb;
