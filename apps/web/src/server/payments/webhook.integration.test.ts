/**
 * The Razorpay webhook against a real database (plan phase 7 acceptance), with signed
 * fixture deliveries and a fake Razorpay API: a bad signature is refused, logged, reported
 * and not stored; a captured payment unlocks; a replay changes nothing; one pay-per-view
 * purchase opens only that drill; a renewal extends; two subscription events delivered out
 * of order end in the right state; a full refund locks at once and a failed one gives
 * access back; an event left unprocessed
 * is finished by the sweep; two deliveries of the same payment racing grant once.
 */
import { createDb, type PrismaClient } from "@eyeq/db";
import { seedConfig } from "@eyeq/db/seed";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localAdminUrl, makeAthlete } from "../../../test/db";
import {
  delivery,
  epoch,
  FakeRazorpay,
  rid,
  WEBHOOK_SECRET,
  webhookRequest,
  type Delivery,
} from "../../../test/razorpay";
import { runtimeUrl } from "../db";
import { listPaymentFlags, resolvePaymentFlag } from "../services/admin/payments";
import { sweepEvents, type GrantResult } from "./process";
import { handleRazorpayWebhook } from "./webhook";

const url = localAdminUrl();
const describeDb = url ? describe : describe.skip;

describeDb("POST /api/webhooks/razorpay", () => {
  const admin = new pg.Client({ connectionString: url });
  let service: PrismaClient;
  const rzp = new FakeRazorpay();
  const reports: unknown[] = [];
  const grants: GrantResult[] = [];
  let clock = new Date();
  let athlete: string;
  let program: string;
  let drillA: string;
  let drillB: string;
  const products = { program: "", drill: "", sub: "" };

  const send = (d: Delivery) =>
    handleRazorpayWebhook(webhookRequest(d), {
      secret: WEBHOOK_SECRET,
      db: service,
      razorpay: rzp,
      report: (e) => reports.push(e),
      onGrant: async (r) => {
        grants.push(r);
      },
      now: () => clock,
    });

  const one = async <T extends pg.QueryResultRow>(sql: string, args: unknown[] = []) =>
    (await admin.query<T>(sql, args)).rows[0]!;
  const access = async (user: string, scope: string, id: string | null, at = clock) =>
    (await one<{ ok: boolean }>("select has_access($1, $2, $3, $4) as ok", [user, scope, id, at]))
      .ok;
  const checkout = async (
    user: string,
    product: string,
    kind: "order" | "subscription",
    scope: string,
    scopeId: string | null,
    externalId: string,
    amount: number,
  ) =>
    admin.query(
      `insert into checkouts (user_id, product_id, kind, scope, scope_id, external_id, amount_paise)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [user, product, kind, scope, scopeId, externalId, amount],
    );
  const subEntitlement = (user: string) =>
    one<{ id: string; status: string; ends_at: Date }>(
      `select id, status, ends_at from entitlements where user_id = $1 and scope = 'subscription' order by created_at desc limit 1`,
      [user],
    );

  beforeAll(async () => {
    await admin.connect();
    await seedConfig(admin);
    service = createDb({
      connectionString: runtimeUrl("eyeq_service", { DATABASE_URL: url! }),
      max: 6,
    });
    athlete = await makeAthlete(admin, { name: "Payer" });
    await admin.query(
      `insert into measurement_tags (slug, name, "group") values ('executive-scan', 'Executive Scan', 'cognition') on conflict do nothing`,
    );
    program = (
      await one<{ id: string }>(
        `insert into programs (slug, title, duration_days, is_free, in_subscription, status)
         values ($1, 'Paid program', 3, false, true, 'published') returning id`,
        [`paid-${rid("p")}`],
      )
    ).id;
    products.program = (
      await one<{ id: string }>(
        `insert into products (kind, title, price_paise, grants) values ('program', 'Paid program', 99900,
           jsonb_build_object('scope', 'program', 'scope_id', $1::uuid)) returning id`,
        [program],
      )
    ).id;
    products.drill = (
      await one<{ id: string }>(
        `insert into products (kind, title, price_paise, grants) values ('drill', 'PPV', 9900, '{"scope":"drill"}') returning id`,
      )
    ).id;
    products.sub = (
      await one<{ id: string }>(
        `insert into products (kind, title, price_paise, grants, razorpay_plan_id)
         values ('subscription', 'Pro monthly', 29900, '{"scope":"subscription","duration_days":30}', 'plan_test') returning id`,
      )
    ).id;
    const drill = async (title: string) =>
      (
        await one<{ id: string }>(
          `insert into drills (title, video_provider, video_ref, measurement_tag, access, ppv_product_id, duration_minutes,
             score_type, score_direction, status)
           values ($1, 'youtube', 'ref', 'executive-scan', 'ppv', $2, 3, 'none', 'higher', 'published') returning id`,
          [title, products.drill],
        )
      ).id;
    drillA = await drill("PPV A");
    drillB = await drill("PPV B");
  });

  afterAll(async () => {
    await service.$disconnect();
    await admin.end();
  });

  it("a bad or missing signature is a 401, reported, and nothing is stored", async () => {
    const before = (await one<{ n: number }>("select count(*)::int as n from payment_events")).n;
    const forged = delivery(
      "payment.captured",
      { payment: { id: "pay_forged" } },
      { secret: "wrong" },
    );
    const unsigned = delivery("payment.captured", { payment: { id: "pay_unsigned" } });
    delete unsigned.headers["x-razorpay-signature"];
    const tampered = delivery("payment.captured", { payment: { id: "pay_x", amount: 100 } });
    tampered.body = tampered.body.replace('"amount":100', '"amount":1');
    for (const d of [forged, unsigned, tampered]) expect((await send(d)).status).toBe(401);
    expect((await one<{ n: number }>("select count(*)::int as n from payment_events")).n).toBe(
      before,
    );
    expect(reports.filter((e) => (e as Error).name === "WebhookSignatureRejected")).toHaveLength(3);
  });

  it("a captured program payment unlocks it; a replay and order.paid change nothing", async () => {
    const order = rid("order");
    await checkout(athlete, products.program, "order", "program", program, order, 99900);
    expect(await access(athlete, "program", program)).toBe(false);
    const payment = rzp.pay(order, 99900);
    const captured = delivery("payment.captured", { payment });
    const res = await send(captured);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, processed: true });
    expect(await access(athlete, "program", program)).toBe(true);

    const ent = await one<{ entitlement_id: string }>(
      "select entitlement_id from payment_grants where payment_id = $1",
      [payment.id],
    );
    const events = async () =>
      (
        await one<{ n: number }>(
          "select count(*)::int as n from entitlement_events where entitlement_id = $1",
          [ent.entitlement_id],
        )
      ).n;
    expect(await events()).toBe(1);

    const replay = await send(captured);
    expect(await replay.json()).toMatchObject({ ok: true, replay: true });
    await send(delivery("order.paid", { payment, order: { id: order } }));
    expect(await events()).toBe(1);
    expect(grants.filter((g) => g.payment_id === payment.id)).toHaveLength(1);
    expect(grants.find((g) => g.payment_id === payment.id)).toMatchObject({
      product_kind: "program",
      user_id: athlete,
    });
  });

  it("one pay-per-view drill purchase opens only that drill", async () => {
    const buyer = await makeAthlete(admin, { name: "PPV buyer" });
    const order = rid("order");
    await checkout(buyer, products.drill, "order", "drill", drillA, order, 9900);
    await send(delivery("payment.captured", { payment: rzp.pay(order, 9900) }));
    expect(await access(buyer, "drill", drillA)).toBe(true);
    expect(await access(buyer, "drill", drillB)).toBe(false);
    expect(await access(buyer, "program", program)).toBe(false);
  });

  it("a subscription activates, renews and extends ends_at", async () => {
    const user = await makeAthlete(admin, { name: "Subscriber" });
    const sub = rid("sub");
    await checkout(user, products.sub, "subscription", "subscription", null, sub, 29900);
    const start = new Date(clock);
    const day = 86400;
    rzp.subscriptions.set(sub, {
      id: sub,
      entity: "subscription",
      plan_id: "plan_test",
      status: "active",
      current_start: epoch(start),
      current_end: epoch(start) + 30 * day,
      ended_at: null,
      notes: [],
    });
    const p1 = rzp.pay(rid("order"), 29900, { invoice_id: rid("inv") });
    await send(delivery("subscription.activated", { subscription: rzp.subscriptions.get(sub)! }));
    await send(
      delivery("subscription.charged", { subscription: rzp.subscriptions.get(sub)!, payment: p1 }),
    );
    expect(await access(user, "subscription", null)).toBe(true);
    expect((await subEntitlement(user)).ends_at.getTime()).toBe((epoch(start) + 30 * day) * 1000);

    // Renewal 30 days on
    const s = rzp.subscriptions.get(sub)!;
    s.current_start = epoch(start) + 30 * day;
    s.current_end = epoch(start) + 60 * day;
    clock = new Date(start.getTime() + 30 * day * 1000 + 60_000);
    const p2 = rzp.pay(rid("order"), 29900, { invoice_id: rid("inv") });
    await send(delivery("subscription.charged", { subscription: s, payment: p2 }));
    const e = await subEntitlement(user);
    expect(e.status).toBe("active");
    expect(e.ends_at.getTime()).toBe((epoch(start) + 60 * day) * 1000);
    expect(grants.filter((g) => g.payment_id === p2.id)).toHaveLength(1);
    clock = new Date();
  });

  it("two subscription events delivered out of order end in the right state", async () => {
    const user = await makeAthlete(admin, { name: "Out of order" });
    const sub = rid("sub");
    await checkout(user, products.sub, "subscription", "subscription", null, sub, 29900);
    const now = epoch(clock);
    // What happened: the renewal charge failed (pending), then the retry succeeded (active).
    const pendingCopy = {
      id: sub,
      entity: "subscription" as const,
      plan_id: "plan_test",
      status: "pending" as const,
      current_start: now - 30 * 86400,
      current_end: now,
      ended_at: null,
      notes: [],
    };
    const activeNow = {
      ...pendingCopy,
      status: "active" as const,
      current_start: now,
      current_end: now + 30 * 86400,
    };
    rzp.subscriptions.set(sub, activeNow);
    const charge = rzp.pay(rid("order"), 29900, { invoice_id: rid("inv") });
    // Delivered in the wrong order: charged first, then the older pending.
    await send(delivery("subscription.charged", { subscription: activeNow, payment: charge }));
    await send(delivery("subscription.pending", { subscription: pendingCopy }));
    const e = await subEntitlement(user);
    expect(e.status).toBe("active");
    expect(e.ends_at.getTime()).toBe((now + 30 * 86400) * 1000);
  });

  it("a cancelled subscription runs to period end, then the hourly expiry sweep locks it", async () => {
    const user = await makeAthlete(admin, { name: "Canceller" });
    const sub = rid("sub");
    await checkout(user, products.sub, "subscription", "subscription", null, sub, 29900);
    const now = epoch(clock);
    const s = {
      id: sub,
      entity: "subscription" as const,
      plan_id: "plan_test",
      status: "cancelled" as const,
      current_start: now - 10 * 86400,
      current_end: now + 20 * 86400,
      ended_at: now,
      notes: [],
    };
    rzp.subscriptions.set(sub, s);
    await send(delivery("subscription.cancelled", { subscription: s }));
    expect(await access(user, "subscription", null)).toBe(true);
    const end = new Date((now + 20 * 86400) * 1000);
    await admin.query("select cron_run('entitlement-expiry', $1)", [
      new Date(end.getTime() - 3600_000),
    ]);
    expect(await access(user, "subscription", null, new Date(end.getTime() - 3600_000))).toBe(true);
    await admin.query("select cron_run('entitlement-expiry', $1)", [
      new Date(end.getTime() + 60_000),
    ]);
    expect((await subEntitlement(user)).status).toBe("ended");
  });

  it("a full refund locks at once; a partial refund only flags", async () => {
    const user = await makeAthlete(admin, { name: "Refunded" });
    const order = rid("order");
    await checkout(user, products.program, "order", "program", program, order, 99900);
    const payment = rzp.pay(order, 99900);
    await send(delivery("payment.captured", { payment }));
    expect(await access(user, "program", program)).toBe(true);

    payment.amount_refunded = 10000;
    payment.refund_status = "partial";
    rzp.payments.set(payment.id, payment);
    const partial = rzp.refund(payment.id, 10000);
    await send(delivery("refund.processed", { refund: partial, payment }));
    expect(await access(user, "program", program)).toBe(true);
    expect(
      (
        await one<{ n: number }>(
          "select count(*)::int as n from payment_flags where external_id = $1",
          [partial.id],
        )
      ).n,
    ).toBe(1);

    // The admin sees it under "Payments to review" and can mark it reviewed.
    const listed = await service.$transaction((tx) => listPaymentFlags(tx));
    const flag = listed.flags.find((f) => f.externalId === partial.id)!;
    expect(flag).toMatchObject({
      kind: "partial_refund",
      userId: user,
      athlete: "Refunded",
      resolvedAt: null,
    });
    const audits: unknown[] = [];
    const resolved = await service.$transaction((tx) =>
      resolvePaymentFlag(tx, flag.id, user, async (e) => void audits.push(e)),
    );
    expect(resolved.resolvedAt).not.toBeNull();
    expect(audits).toHaveLength(1);

    payment.amount_refunded = 99900;
    payment.refund_status = "full";
    payment.status = "refunded";
    rzp.payments.set(payment.id, payment);
    const rest = rzp.refund(payment.id, 89900);
    await send(delivery("refund.processed", { refund: rest, payment }));
    expect(await access(user, "program", program)).toBe(false);
  });

  it("a full refund locks on refund.created; refund.failed gives access back, with an event", async () => {
    const user = await makeAthlete(admin, { name: "Refund failed" });
    const order = rid("order");
    await checkout(user, products.program, "order", "program", program, order, 99900);
    const payment = rzp.pay(order, 99900);
    await send(delivery("payment.captured", { payment }));
    const ent = (
      await one<{ e: string }>(
        "select entitlement_id as e from payment_grants where payment_id = $1",
        [payment.id],
      )
    ).e;
    const events = async () =>
      await one<{ n: number; last: string }>(
        `select count(*)::int as n,
             (select change || ':' || coalesce(reason, '') from entitlement_events where entitlement_id = $1 order by seq desc limit 1) as last
           from entitlement_events where entitlement_id = $1`,
        [ent],
      );

    // refund.created: Razorpay is still processing the refund (pending); access ends now.
    const refund = rzp.refund(payment.id, 99900, "pending");
    await send(delivery("refund.created", { refund, payment }));
    expect(await access(user, "program", program)).toBe(false);
    expect(await events()).toEqual({ n: 2, last: "revoked:refund" });

    // refund.failed: the money did not go back, so the program opens again.
    rzp.refunds.get(payment.id)![0]!.status = "failed";
    const failed = delivery("refund.failed", { refund: { ...refund, status: "failed" }, payment });
    await send(failed);
    expect(await access(user, "program", program)).toBe(true);
    expect(await events()).toEqual({ n: 3, last: "reactivated:refund_failed" });
    await send(failed); // a replay
    await send(delivery("refund.failed", { refund: { ...refund, status: "failed" }, payment }));
    expect(await events()).toEqual({ n: 3, last: "reactivated:refund_failed" });
    expect(
      (
        await one<{ n: number }>(
          "select count(*)::int as n from payment_flags where external_id = $1",
          [refund.id],
        )
      ).n,
    ).toBe(0);
  });

  it("an event whose processing failed is stored, answered 200, and finished by the sweep", async () => {
    const user = await makeAthlete(admin, { name: "Swept" });
    const sub = rid("sub");
    await checkout(user, products.sub, "subscription", "subscription", null, sub, 29900);
    const now = epoch(clock);
    const s = {
      id: sub,
      entity: "subscription" as const,
      plan_id: "plan_test",
      status: "active" as const,
      current_start: now,
      current_end: now + 30 * 86400,
      ended_at: null,
      notes: [],
    };
    rzp.subscriptions.set(sub, s);
    rzp.failFetch = true;
    const res = await send(delivery("subscription.activated", { subscription: s }));
    rzp.failFetch = false;
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, processed: false });
    expect(await access(user, "subscription", null)).toBe(false);
    const row = await one<{ attempts: number; last_error: string; processed_at: Date | null }>(
      "select attempts, last_error, processed_at from payment_events where payload->'payload'->'subscription'->'entity'->>'id' = $1",
      [sub],
    );
    expect(row).toMatchObject({ attempts: 1, processed_at: null });
    expect(row.last_error).toContain("unavailable");
    const out = await sweepEvents(
      { db: service, razorpay: rzp, now: () => new Date(clock.getTime() + 5 * 60_000) },
      async () => {},
      200,
    );
    expect(out.processed).toBeGreaterThanOrEqual(1);
    expect(await access(user, "subscription", null)).toBe(true);
  });

  it("two deliveries of the same payment racing produce one grant and one entitlement event", async () => {
    const user = await makeAthlete(admin, { name: "Racer" });
    const order = rid("order");
    await checkout(user, products.program, "order", "program", program, order, 99900);
    const payment = rzp.pay(order, 99900);
    const before = grants.length;
    const results = await Promise.all([
      send(delivery("payment.captured", { payment })),
      send(delivery("order.paid", { payment, order: { id: order } })),
      send(delivery("payment.captured", { payment })),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    const g = await one<{ n: number; e: string }>(
      "select count(*)::int as n, min(entitlement_id::text) as e from payment_grants where payment_id = $1",
      [payment.id],
    );
    expect(g.n).toBe(1);
    expect(
      (
        await one<{ n: number }>(
          "select count(*)::int as n from entitlement_events where entitlement_id = $1",
          [g.e],
        )
      ).n,
    ).toBe(1);
    expect(grants.slice(before).filter((x) => x.payment_id === payment.id)).toHaveLength(1);
  });
});
