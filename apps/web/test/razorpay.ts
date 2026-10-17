/**
 * Razorpay for tests: a fake API that holds subscriptions and payments in memory, and
 * webhook deliveries signed with a test secret exactly as Razorpay signs them (hex
 * HMAC-SHA256 of the raw body). Entity shapes follow Razorpay's docs (DECISIONS, phase 7).
 */
import {
  RazorpayError,
  signHex,
  type Razorpay,
  type RzpOrder,
  type RzpPayment,
  type RzpRefund,
  type RzpSubscription,
} from "../src/server/payments/razorpay";

export const WEBHOOK_SECRET = "whsec_test_only";
export const KEY_SECRET = "key_secret_test_only";

let n = 0;
export const rid = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const epoch = (d: Date) => Math.floor(d.getTime() / 1000);

export class FakeRazorpay implements Razorpay {
  orders = new Map<string, RzpOrder>();
  subscriptions = new Map<string, RzpSubscription>();
  payments = new Map<string, RzpPayment>();
  refunds = new Map<string, RzpRefund[]>();
  failFetch = false;
  calls: string[] = [];

  async createOrder(body: {
    amount: number;
    currency: string;
    receipt: string;
    notes: Record<string, string>;
  }): Promise<RzpOrder> {
    this.calls.push("createOrder");
    const o: RzpOrder = { id: rid("order"), entity: "order", status: "created", ...body };
    this.orders.set(o.id, o);
    return o;
  }
  async createSubscription(body: {
    plan_id: string;
    total_count: number;
    customer_notify: boolean;
    notes: Record<string, string>;
  }): Promise<RzpSubscription> {
    this.calls.push("createSubscription");
    const s: RzpSubscription = {
      id: rid("sub"),
      entity: "subscription",
      plan_id: body.plan_id,
      status: "created",
      current_start: null,
      current_end: null,
      ended_at: null,
      notes: body.notes,
      total_count: body.total_count,
    };
    this.subscriptions.set(s.id, s);
    return s;
  }
  async cancelSubscription(id: string, atCycleEnd: boolean): Promise<RzpSubscription> {
    this.calls.push(`cancel:${atCycleEnd}`);
    const s = this.subscriptions.get(id);
    if (!s) throw new RazorpayError(400, "BAD_REQUEST_ERROR", "no such subscription");
    // At cycle end Razorpay keeps it active until the end; immediately, it is cancelled now.
    if (!atCycleEnd) s.status = "cancelled";
    return s;
  }
  async fetchPayment(id: string): Promise<RzpPayment> {
    this.calls.push(`fetchPayment:${id}`);
    if (this.failFetch) throw new RazorpayError(503, undefined, "Razorpay unavailable");
    const p = this.payments.get(id);
    if (!p) throw new RazorpayError(400, "BAD_REQUEST_ERROR", "no such payment");
    return { ...p };
  }
  async fetchPaymentRefunds(id: string): Promise<{ items: RzpRefund[] }> {
    this.calls.push(`fetchPaymentRefunds:${id}`);
    if (this.failFetch) throw new RazorpayError(503, undefined, "Razorpay unavailable");
    return { items: (this.refunds.get(id) ?? []).map((r) => ({ ...r })) };
  }
  /** A refund of a payment, as Razorpay would list it. */
  refund(paymentId: string, amount: number, status: RzpRefund["status"] = "processed"): RzpRefund {
    const r: RzpRefund = {
      id: rid("rfnd"),
      entity: "refund",
      payment_id: paymentId,
      amount,
      status,
    };
    this.refunds.set(paymentId, [...(this.refunds.get(paymentId) ?? []), r]);
    return r;
  }
  async fetchSubscription(id: string): Promise<RzpSubscription> {
    this.calls.push(`fetchSubscription:${id}`);
    if (this.failFetch) throw new RazorpayError(503, undefined, "Razorpay unavailable");
    const s = this.subscriptions.get(id);
    if (!s) throw new RazorpayError(400, "BAD_REQUEST_ERROR", "no such subscription");
    return { ...s };
  }
  async fetchPlans() {
    return { items: [], count: 0 };
  }
  async createPlan(): Promise<never> {
    throw new Error("not in tests");
  }

  /** A captured payment for an order, as Razorpay would hold it. */
  pay(orderId: string, amount: number, extra: Partial<RzpPayment> = {}): RzpPayment {
    const p: RzpPayment = {
      id: rid("pay"),
      entity: "payment",
      amount,
      currency: "INR",
      status: "captured",
      order_id: orderId,
      invoice_id: null,
      amount_refunded: 0,
      refund_status: null,
      captured: true,
      notes: [],
      method: "upi",
      ...extra,
    };
    this.payments.set(p.id, p);
    return p;
  }
}

export interface Delivery {
  body: string;
  headers: Record<string, string>;
}

/** A webhook delivery: the envelope, its raw body and the signature Razorpay would send. */
export function delivery(
  event: string,
  payload: Record<string, unknown>,
  opts: { eventId?: string; secret?: string; at?: Date } = {},
): Delivery {
  const body = JSON.stringify({
    entity: "event",
    account_id: "acc_test",
    event,
    contains: Object.keys(payload),
    payload: Object.fromEntries(Object.entries(payload).map(([k, v]) => [k, { entity: v }])),
    created_at: epoch(opts.at ?? new Date()),
  });
  return {
    body,
    headers: {
      "content-type": "application/json",
      "x-razorpay-event-id": opts.eventId ?? rid("evt"),
      "x-razorpay-signature": signHex(opts.secret ?? WEBHOOK_SECRET, body),
    },
  };
}

export const webhookRequest = (d: Delivery) =>
  new Request("http://test/api/webhooks/razorpay", {
    method: "POST",
    headers: d.headers,
    body: d.body,
  });
