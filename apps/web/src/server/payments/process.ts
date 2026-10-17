import type { PrismaClient, Tx } from "@eyeq/db";
import { log } from "../observability/log";
import type { Razorpay, RzpPayment, RzpSubscription } from "./razorpay";

/**
 * Turns a stored Razorpay event into entitlement changes. Every decision is made by the
 * SQL functions of migration 0023 (rule 1); this layer only fetches what they need.
 *
 * Out-of-order safety: on any subscription event the subscription is fetched from
 * Razorpay's API and the entitlement is set from that state, never from the event's own
 * copy, so a late `subscription.pending` cannot undo a later `subscription.charged`. If
 * the fetch fails, the event stays unprocessed and the sweep retries it. Refund events
 * fetch the payment for the same reason (its `amount_refunded` is the running total).
 */
export type Via = "webhook" | "refresh" | "sweep";

/** What a first grant reports: ids and product kind only (rule 11). */
export interface GrantResult {
  granted: boolean;
  user_id?: string;
  product_id?: string;
  product_kind?: string;
  payment_id?: string | null;
  checkout_id?: string;
  entitlement_id?: string | null;
  reason?: string;
  change?: string | null;
  /** Subscription sync: the entitlement as it now stands. */
  status?: string | null;
  ends_at?: string | null;
}

export interface ProcessDeps {
  db: PrismaClient; // eyeq_service
  razorpay: Razorpay;
  now?: () => Date;
}

interface Envelope {
  event?: string;
  payload?: {
    payment?: { entity?: RzpPayment };
    order?: { entity?: { id?: string } };
    subscription?: { entity?: RzpSubscription };
    refund?: { entity?: { id?: string; payment_id?: string; amount?: number } };
    dispute?: { entity?: { id?: string; payment_id?: string } };
  };
}

/** The webhook events the processor acts on. Razorpay's dashboard subscribes to these. */
export const HANDLED_EVENTS = [
  "payment.captured",
  "order.paid",
  "subscription.authenticated",
  "subscription.activated",
  "subscription.charged",
  "subscription.pending",
  "subscription.halted",
  "subscription.cancelled",
  "subscription.completed",
  "subscription.paused",
  "subscription.resumed",
  "subscription.updated",
  "refund.created",
  "refund.processed",
  "refund.failed",
  "payment.dispute.created",
  "payment.dispute.won",
  "payment.dispute.lost",
  "payment.dispute.closed",
] as const;

async function first(query: Promise<{ r: unknown }[]>): Promise<GrantResult> {
  const rows = await query;
  return (rows[0]?.r ?? { granted: false }) as GrantResult;
}

export async function applyCapturedPayment(
  tx: Tx,
  payment: RzpPayment,
  via: Via,
  eventId: string | null,
  at: Date,
): Promise<GrantResult> {
  return first(
    tx.$queryRaw`select razorpay_payment_captured(${JSON.stringify(payment)}::jsonb, ${via}, ${eventId}::uuid, ${at}) as r`,
  );
}

export async function applySubscription(
  tx: Tx,
  sub: RzpSubscription,
  payment: RzpPayment | null,
  via: Via,
  eventId: string | null,
  at: Date,
): Promise<GrantResult> {
  return first(
    tx.$queryRaw`select razorpay_subscription_sync(${JSON.stringify(sub)}::jsonb, ${payment ? JSON.stringify(payment) : null}::jsonb, ${via}, ${eventId}::uuid, ${at}) as r`,
  );
}

/** The entity-level work for one event, inside the caller's transaction. */
async function handle(
  tx: Tx,
  razorpay: Razorpay,
  env: Envelope,
  eventId: string,
  via: Via,
  at: Date,
): Promise<GrantResult[]> {
  const type = env.event ?? "";
  const p = env.payload ?? {};
  if (type === "payment.captured" || type === "order.paid") {
    const payment = p.payment?.entity;
    if (!payment) throw new Error(`${type} without a payment entity`);
    return [await applyCapturedPayment(tx, payment, via, eventId, at)];
  }
  if (type.startsWith("subscription.")) {
    const id = p.subscription?.entity?.id;
    if (!id) throw new Error(`${type} without a subscription entity`);
    const sub = await razorpay.fetchSubscription(id);
    const payment = p.payment?.entity?.status === "captured" ? p.payment.entity : null;
    return [await applySubscription(tx, sub, payment, via, eventId, at)];
  }
  if (type.startsWith("refund.")) {
    const refund = p.refund?.entity;
    const paymentId = refund?.payment_id ?? p.payment?.entity?.id;
    if (!refund || !paymentId) throw new Error(`${type} without a refund and its payment`);
    const payment = await razorpay.fetchPayment(paymentId);
    const rows = await tx.$queryRaw<{ r: GrantResult }[]>`
      select razorpay_refund(${JSON.stringify(refund)}::jsonb, ${JSON.stringify(payment)}::jsonb, ${eventId}::uuid, ${at}) as r`;
    return [rows[0]!.r];
  }
  if (type.startsWith("payment.dispute.")) {
    const dispute = p.dispute?.entity;
    if (!dispute) throw new Error(`${type} without a dispute entity`);
    const rows = await tx.$queryRaw<{ r: GrantResult }[]>`
      select razorpay_dispute(${type}, ${JSON.stringify(dispute)}::jsonb, ${eventId}::uuid, ${at}) as r`;
    return [rows[0]!.r];
  }
  return []; // stored, nothing to do (an event we do not subscribe to)
}

export type ProcessOutcome =
  | { status: "processed"; results: GrantResult[] }
  | { status: "skipped" } // already processed, or another run holds it
  | { status: "failed"; error: string };

/**
 * Processes one stored event in one transaction: claims the row (FOR UPDATE SKIP LOCKED,
 * so the request that stored it and the sweep never both process it), applies it, and
 * sets processed_at. On failure the transaction rolls back and the attempt is recorded,
 * so the sweep tries again.
 */
export async function processEvent(
  deps: ProcessDeps,
  eventId: string,
  via: Via,
): Promise<ProcessOutcome> {
  const at = deps.now?.() ?? new Date();
  try {
    const out = await deps.db.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<{ payload: Envelope }[]>`
          select payload from payment_events
          where id = ${eventId}::uuid and processed_at is null
          for update skip locked`;
        const row = rows[0];
        if (!row) return { status: "skipped" } as const;
        const results = await handle(tx, deps.razorpay, row.payload, eventId, via, at);
        await tx.$executeRaw`
          update payment_events set processed_at = ${at}, attempts = attempts + 1, last_error = null
          where id = ${eventId}::uuid`;
        return { status: "processed", results } as const;
      },
      { timeout: 15_000 },
    );
    return out;
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    log("warn", "payments.process_failed", { eventId, via, error });
    await deps.db.$executeRaw`
      update payment_events set attempts = attempts + 1, last_error = ${error.slice(0, 500)}
      where id = ${eventId}::uuid and processed_at is null`;
    return { status: "failed", error };
  }
}

/** The sweep: every event still unprocessed after a couple of minutes, oldest first. */
export async function sweepEvents(
  deps: ProcessDeps,
  onGrant: (r: GrantResult) => Promise<void>,
  limit = 20,
): Promise<{ due: number; processed: number; failed: number }> {
  const at = deps.now?.() ?? new Date();
  const due = await deps.db.$queryRaw<{ id: string }[]>`
    select payment_events_due as id from payment_events_due(${limit}::integer, 10, interval '2 minutes', ${at})`;
  let processed = 0;
  let failed = 0;
  for (const { id } of due) {
    const out = await processEvent(deps, id, "sweep");
    if (out.status === "processed") {
      processed++;
      for (const r of out.results) if (r.granted) await onGrant(r);
    } else if (out.status === "failed") failed++;
  }
  return { due: due.length, processed, failed };
}
