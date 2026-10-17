import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Razorpay's REST API (https://api.razorpay.com/v1, Basic auth with the key id and secret)
 * and its two signatures, with plain fetch: the calls we make are few and the official SDK
 * adds nothing we need. Names and fields follow Razorpay's docs as read on 2026-10-17
 * (DECISIONS.md, phase 7). Server-only: the key secret and webhook secret never reach a
 * browser (rule 12); only the key id is public, for Checkout.
 *
 * Entities are passed on as Razorpay returns them; the database decides what they grant.
 */
export type Fetch = typeof fetch;

export interface RazorpayKeys {
  keyId: string;
  keySecret: string;
}

/** The parts of Razorpay's entities the server reads. Everything else is passed through. */
export interface RzpPayment {
  id: string;
  entity: "payment";
  amount: number;
  currency: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  order_id: string | null;
  invoice_id: string | null;
  amount_refunded: number;
  refund_status: "partial" | "full" | null;
  captured: boolean;
  notes: Record<string, string> | unknown[];
  [k: string]: unknown;
}

export interface RzpRefund {
  id: string;
  entity: "refund";
  payment_id: string;
  amount: number;
  status: "pending" | "processed" | "failed";
  [k: string]: unknown;
}

export interface RzpOrder {
  id: string;
  entity: "order";
  amount: number;
  currency: string;
  receipt: string | null;
  status: "created" | "attempted" | "paid";
  notes: Record<string, string> | unknown[];
  [k: string]: unknown;
}

export interface RzpSubscription {
  id: string;
  entity: "subscription";
  plan_id: string;
  status:
    | "created"
    | "authenticated"
    | "active"
    | "pending"
    | "halted"
    | "cancelled"
    | "completed"
    | "expired"
    | "paused";
  current_start: number | null;
  current_end: number | null;
  ended_at: number | null;
  short_url?: string;
  notes: Record<string, string> | unknown[];
  [k: string]: unknown;
}

export interface RzpPlan {
  id: string;
  entity: "plan";
  period: string;
  interval: number;
  item: { id: string; name: string; amount: number; currency: string };
  notes: Record<string, string> | unknown[];
  [k: string]: unknown;
}

export class RazorpayError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = "RazorpayError";
  }
}

export interface Razorpay {
  createOrder(body: {
    amount: number;
    currency: string;
    receipt: string;
    notes: Record<string, string>;
  }): Promise<RzpOrder>;
  createSubscription(body: {
    plan_id: string;
    total_count: number;
    customer_notify: boolean;
    notes: Record<string, string>;
  }): Promise<RzpSubscription>;
  cancelSubscription(id: string, atCycleEnd: boolean): Promise<RzpSubscription>;
  fetchPayment(id: string): Promise<RzpPayment>;
  /** GET /payments/{id}/refunds: every refund of the payment, each with its own status. */
  fetchPaymentRefunds(id: string): Promise<{ items: RzpRefund[] }>;
  fetchSubscription(id: string): Promise<RzpSubscription>;
  fetchPlans(count?: number, skip?: number): Promise<{ items: RzpPlan[]; count: number }>;
  createPlan(body: {
    period: string;
    interval: number;
    item: { name: string; amount: number; currency: string; description?: string };
    notes: Record<string, string>;
  }): Promise<RzpPlan>;
}

const BASE = "https://api.razorpay.com/v1";

export function razorpayClient(keys: RazorpayKeys, fetcher: Fetch = fetch): Razorpay {
  const auth = `Basic ${Buffer.from(`${keys.keyId}:${keys.keySecret}`).toString("base64")}`;
  async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const res = await fetcher(`${BASE}${path}`, {
      method,
      headers: {
        authorization: auth,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    const text = await res.text();
    let json: unknown = undefined;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      // not JSON: reported below by status
    }
    if (!res.ok) {
      const err = (json as { error?: { code?: string; description?: string } } | undefined)?.error;
      throw new RazorpayError(
        res.status,
        err?.code,
        `Razorpay ${method} ${path.replace(/\/[a-z]+_[A-Za-z0-9]+/g, "/:id")} failed: ${res.status} ${err?.description ?? ""}`.trim(),
      );
    }
    return json as T;
  }
  const id = (v: string) => encodeURIComponent(v);
  return {
    createOrder: (body) => call("POST", "/orders", body),
    createSubscription: (body) => call("POST", "/subscriptions", body),
    cancelSubscription: (sub, atCycleEnd) =>
      call("POST", `/subscriptions/${id(sub)}/cancel`, { cancel_at_cycle_end: atCycleEnd }),
    fetchPayment: (pay) => call("GET", `/payments/${id(pay)}`),
    fetchPaymentRefunds: (pay) => call("GET", `/payments/${id(pay)}/refunds?count=100`),
    fetchSubscription: (sub) => call("GET", `/subscriptions/${id(sub)}`),
    fetchPlans: (count = 100, skip = 0) => call("GET", `/plans?count=${count}&skip=${skip}`),
    createPlan: (body) => call("POST", "/plans", body),
  };
}

function hmacHex(secret: string, data: string): Buffer {
  return createHmac("sha256", secret).update(data).digest();
}

function equalHex(expected: Buffer, given: string | null | undefined): boolean {
  if (!given || !/^[0-9a-f]+$/i.test(given)) return false;
  const g = Buffer.from(given, "hex");
  return g.length === expected.length && timingSafeEqual(g, expected);
}

/**
 * X-Razorpay-Signature: hex HMAC-SHA256 of the raw request body with the webhook secret.
 * The body must be the bytes as received, never re-serialised JSON. Several secrets may be
 * joined with "|" during a rotation (older events are retried under the old secret).
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
  secret: string,
): boolean {
  return secret
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean)
    .some((s) => equalHex(hmacHex(s, rawBody), signature));
}

/**
 * Checkout's handler signature, keyed with the API key secret. Orders sign
 * `order_id|payment_id`; subscriptions sign `payment_id|subscription_id`. The order or
 * subscription id must be the one stored on our side, never the one Checkout returned.
 */
export function verifyCheckoutSignature(
  keySecret: string,
  p:
    | { kind: "order"; orderId: string; paymentId: string; signature: string }
    | { kind: "subscription"; subscriptionId: string; paymentId: string; signature: string },
): boolean {
  const data =
    p.kind === "order" ? `${p.orderId}|${p.paymentId}` : `${p.paymentId}|${p.subscriptionId}`;
  return equalHex(hmacHex(keySecret, data), p.signature);
}

/** For tests and fixtures: sign a body the way Razorpay does. */
export function signHex(secret: string, data: string): string {
  return hmacHex(secret, data).toString("hex");
}
