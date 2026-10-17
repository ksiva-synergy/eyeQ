/**
 * Purchases (plan section 7, phase 7): web pays through Razorpay Checkout. The client
 * names a product (and, for a pay-per-view drill, the drill) and never an amount; the
 * server creates the order or subscription from the product's own price. After Checkout's
 * handler fires, POST /purchases/refresh verifies and grants at once, so the purchase
 * unlocks within seconds even before the webhook arrives. Mobile pays through the stores
 * (phase 9) and reads the same products and entitlements.
 */
import { z } from "zod";

const timestamp = z.iso.datetime({ offset: true });

/** Where checkout started; analytics only (ids and kinds, rule 11). */
export const checkoutSurfaceSchema = z.enum(["upgrade", "program", "drill", "today", "landing"]);
export type CheckoutSurface = z.infer<typeof checkoutSurfaceSchema>;

/** The receipt email: optional at sign-up, asked at checkout (plan phase 7). */
export const receiptEmailSchema = z.email().max(254).toLowerCase();

export const purchaseProductSchema = z.object({
  id: z.uuid(),
  kind: z.enum(["subscription", "program", "drill"]),
  title: z.string(),
  pricePaise: z.number().int(),
  currency: z.string(),
  /** Subscriptions: 30, 90 or 365. */
  durationDays: z.number().int().nullable(),
  /** Programs: the program this product sells. */
  programId: z.uuid().nullable(),
  programSlug: z.string().nullable(),
  /** False when no Razorpay plan is linked yet: shown, not buyable. */
  available: z.boolean(),
});
export type PurchaseProduct = z.infer<typeof purchaseProductSchema>;

export const purchaseProductsResponseSchema = z.object({
  products: z.array(purchaseProductSchema),
  /** The athlete's live Pro, if any; the paywall offers a subscription only without one. */
  subscription: z
    .object({ status: z.enum(["active", "grace"]), endsAt: timestamp.nullable() })
    .nullable(),
});
export type PurchaseProductsResponse = z.infer<typeof purchaseProductsResponseSchema>;

const checkoutCommon = {
  productId: z.uuid(),
  email: receiptEmailSchema.optional(),
  surface: checkoutSurfaceSchema.optional(),
};

// Strict: a body naming an amount or anything else unknown is refused, not ignored.
export const razorpayOrderRequestSchema = z.strictObject({
  ...checkoutCommon,
  /** Required for a pay-per-view drill product: the one drill it opens. */
  drillId: z.uuid().optional(),
});
export type RazorpayOrderRequest = z.infer<typeof razorpayOrderRequestSchema>;

export const razorpaySubscriptionRequestSchema = z.strictObject(checkoutCommon);
export type RazorpaySubscriptionRequest = z.infer<typeof razorpaySubscriptionRequestSchema>;

/** What Checkout needs, all decided by the server. */
const checkoutOptions = {
  checkoutId: z.uuid(),
  /** Razorpay's public key id (not a secret). */
  keyId: z.string(),
  name: z.string(),
  description: z.string(),
  prefill: z.object({ contact: z.string().nullable(), email: z.string().nullable() }),
};

export const razorpayOrderResponseSchema = z.object({
  ...checkoutOptions,
  orderId: z.string(),
  amount: z.number().int(),
  currency: z.string(),
});
export type RazorpayOrderResponse = z.infer<typeof razorpayOrderResponseSchema>;

export const razorpaySubscriptionResponseSchema = z.object({
  ...checkoutOptions,
  subscriptionId: z.string(),
});
export type RazorpaySubscriptionResponse = z.infer<typeof razorpaySubscriptionResponseSchema>;

/** Checkout's handler response, passed on as received. */
export const purchaseRefreshRequestSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("order"),
    orderId: z.string().min(1).max(64),
    paymentId: z.string().min(1).max(64),
    signature: z.string().min(1).max(256),
  }),
  z.strictObject({
    kind: z.literal("subscription"),
    subscriptionId: z.string().min(1).max(64),
    paymentId: z.string().min(1).max(64),
    signature: z.string().min(1).max(256),
  }),
]);
export type PurchaseRefreshRequest = z.infer<typeof purchaseRefreshRequestSchema>;

export const purchaseRefreshResponseSchema = z.object({
  /** granted: open now. pending: paid but not captured yet; the webhook will grant it. */
  status: z.enum(["granted", "pending"]),
  scope: z.enum(["subscription", "program", "drill"]),
  scopeId: z.uuid().nullable(),
  /** Where to send the athlete next. */
  next: z.string(),
});
export type PurchaseRefreshResponse = z.infer<typeof purchaseRefreshResponseSchema>;

export const subscriptionCancelResponseSchema = z.object({
  /** Pro stays open until this date, then ends (no further charge). */
  endsAt: timestamp.nullable(),
  providerStatus: z.string(),
});
export type SubscriptionCancelResponse = z.infer<typeof subscriptionCancelResponseSchema>;

/** Account: each payment and what it bought. */
export const purchaseRecordSchema = z.object({
  paymentId: z.string(),
  productKind: z.enum(["subscription", "program", "drill", "credit_pack", "challenge_entry"]),
  title: z.string(),
  amountPaise: z.number().int(),
  currency: z.string(),
  paidAt: timestamp,
  entitlementStatus: z.enum(["active", "grace", "ended"]),
  endsAt: timestamp.nullable(),
});
export const purchasesResponseSchema = z.object({
  purchases: z.array(purchaseRecordSchema),
  subscription: z
    .object({
      subscriptionId: z.string(),
      providerStatus: z.string(),
      renews: z.boolean(),
      currentEnd: timestamp.nullable(),
      cancelRequestedAt: timestamp.nullable(),
    })
    .nullable(),
  /** The receipt email on file; the athlete's own, shown back only to them. */
  billingEmail: z.string().nullable(),
});
export type PurchasesResponse = z.infer<typeof purchasesResponseSchema>;
