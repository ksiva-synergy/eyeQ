/**
 * Checkout on web (plan phase 7) against a real database and a fake Razorpay: the server
 * prices the order from the product, refuses what the athlete already has, and the
 * Checkout refresh verifies the signature, fetches the payment and grants through the
 * webhook's path; the refresh and the webhook racing for one payment grant once.
 */
import {
  purchaseRefreshRequestSchema,
  purchaseRefreshResponseSchema,
  razorpayOrderRequestSchema,
  razorpaySubscriptionRequestSchema,
  purchasesResponseSchema,
  razorpayOrderResponseSchema,
  razorpaySubscriptionResponseSchema,
} from "@eyeq/api-contract";
import { createDb, type PrismaClient } from "@eyeq/db";
import { seedConfig } from "@eyeq/db/seed";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localAdminUrl, makeAthlete } from "../../../test/db";
import {
  delivery,
  epoch,
  FakeRazorpay,
  KEY_SECRET,
  rid,
  WEBHOOK_SECRET,
  webhookRequest,
} from "../../../test/razorpay";
import { apiRoute, type Deps } from "../api/pipeline";
import type { Session, SessionVerifier } from "../auth/session";
import { runtimeUrl } from "../db";
import type { GrantResult } from "../payments/process";
import { signHex } from "../payments/razorpay";
import { handleRazorpayWebhook } from "../payments/webhook";
import {
  cancelSubscription,
  createRazorpayOrder,
  createRazorpaySubscription,
  listPurchases,
  refreshPurchase,
  type PaymentsDeps,
} from "./purchases";

const url = localAdminUrl();
const describeDb = url ? describe : describe.skip;

describeDb("purchases", () => {
  const admin = new pg.Client({ connectionString: url });
  let api: PrismaClient;
  let service: PrismaClient;
  const rzp = new FakeRazorpay();
  const grants: GrantResult[] = [];
  const sessions = new Map<string, Session>();
  let program: string;
  let programSlug: string;
  let drill: string;
  const products = { program: "", drill: "", sub: "" };

  const verifier: SessionVerifier = {
    verify: async (req) => sessions.get(req.headers.get("x-test-user") ?? "") ?? null,
  };
  const deps = (): Deps => ({ db: api, verifier });
  const pay = (): PaymentsDeps => ({
    razorpay: rzp,
    keys: { keyId: "rzp_test_key", keySecret: KEY_SECRET },
    service,
  });
  const req = (user: string, body?: unknown, key?: string) =>
    new Request("http://test/api/v1/x", {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "x-test-user": user,
        "content-type": "application/json",
        ...(key ? { "idempotency-key": key } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

  const orderRoute = apiRoute(
    {
      name: "POST /purchases/razorpay/order",
      body: razorpayOrderRequestSchema,
      idempotent: true,
      handler: ({ tx, session, body }) => createRazorpayOrder(tx, session, body, pay()),
    },
    deps,
  );
  const subRoute = apiRoute(
    {
      name: "POST /purchases/razorpay/subscription",
      body: razorpaySubscriptionRequestSchema,
      idempotent: true,
      handler: ({ tx, session, body }) => createRazorpaySubscription(tx, session, body, pay()),
    },
    deps,
  );
  const refreshRoute = apiRoute(
    {
      name: "POST /purchases/refresh",
      body: purchaseRefreshRequestSchema,
      handler: ({ tx, session, body }) =>
        refreshPurchase(tx, session, body, pay(), async (r) => {
          grants.push(r);
        }),
    },
    deps,
  );
  const cancelRoute = apiRoute(
    {
      name: "POST /purchases/razorpay/subscription/cancel",
      idempotent: true,
      handler: ({ tx, session }) => cancelSubscription(tx, session, pay()),
    },
    deps,
  );
  const listRoute = apiRoute(
    { name: "GET /purchases", handler: ({ tx, session }) => listPurchases(tx, session) },
    deps,
  );
  const webhook = (d: ReturnType<typeof delivery>) =>
    handleRazorpayWebhook(webhookRequest(d), {
      secret: WEBHOOK_SECRET,
      db: service,
      razorpay: rzp,
      report: () => {},
      onGrant: async (r) => {
        grants.push(r);
      },
    });

  const athlete = async (name: string, phone = `+9190${Math.floor(Math.random() * 1e8)}`) => {
    const id = await makeAthlete(admin, { name, phone });
    sessions.set(id, { userId: id, phone, email: null, name });
    return id;
  };
  const access = async (user: string, scope: string, id: string | null) =>
    (await admin.query<{ ok: boolean }>("select has_access($1, $2, $3) as ok", [user, scope, id]))
      .rows[0]!.ok;
  const one = async <T extends pg.QueryResultRow>(sql: string, args: unknown[] = []) =>
    (await admin.query<T>(sql, args)).rows[0]!;

  beforeAll(async () => {
    await admin.connect();
    await seedConfig(admin);
    api = createDb({ connectionString: runtimeUrl("eyeq_api", { DATABASE_URL: url! }), max: 4 });
    service = createDb({
      connectionString: runtimeUrl("eyeq_service", { DATABASE_URL: url! }),
      max: 4,
    });
    await admin.query(
      `insert into measurement_tags (slug, name, "group") values ('executive-scan', 'Executive Scan', 'cognition') on conflict do nothing`,
    );
    programSlug = `buyable-${rid("p")}`;
    products.program = (
      await one<{ id: string }>(
        `insert into products (kind, title, price_paise, grants) values ('program', 'Buyable', 129900, '{"scope":"program"}') returning id`,
      )
    ).id;
    program = (
      await one<{ id: string }>(
        `insert into programs (slug, title, duration_days, is_free, in_subscription, product_id, status)
         values ($1, 'Buyable', 3, false, true, $2, 'published') returning id`,
        [programSlug, products.program],
      )
    ).id;
    // A program product names its program (the admin products list checks every row).
    await admin.query(
      "update products set grants = jsonb_build_object('scope', 'program', 'scope_id', $2::uuid) where id = $1",
      [products.program, program],
    );
    products.drill = (
      await one<{ id: string }>(
        `insert into products (kind, title, price_paise, grants) values ('drill', 'PPV', 9900, '{"scope":"drill"}') returning id`,
      )
    ).id;
    drill = (
      await one<{ id: string }>(
        `insert into drills (title, video_provider, video_ref, measurement_tag, access, ppv_product_id, duration_minutes,
           score_type, score_direction, status)
         values ('Solo drill', 'youtube', 'ref', 'executive-scan', 'ppv', $1, 3, 'none', 'higher', 'published') returning id`,
        [products.drill],
      )
    ).id;
    products.sub = (
      await one<{ id: string }>(
        `insert into products (kind, title, price_paise, grants, razorpay_plan_id)
         values ('subscription', 'Pro quarterly', 79900, '{"scope":"subscription","duration_days":90}', 'plan_q') returning id`,
      )
    ).id;
  });

  afterAll(async () => {
    await api.$disconnect();
    await service.$disconnect();
    await admin.end();
  });

  it("an order is priced by the server, attached to the athlete, and prefilled", async () => {
    const u = await athlete("Buyer");
    const res = await orderRoute(
      req(
        u,
        { productId: products.program, email: "Buyer@Example.com", surface: "program" },
        rid("k"),
      ),
    );
    expect(res.status).toBe(200);
    const body = razorpayOrderResponseSchema.parse(await res.json());
    expect(body).toMatchObject({ amount: 129900, currency: "INR", keyId: "rzp_test_key" });
    expect(body.prefill).toEqual({ contact: sessions.get(u)!.phone, email: "buyer@example.com" });
    const order = rzp.orders.get(body.orderId)!;
    expect(order.amount).toBe(129900);
    expect(order.notes).toMatchObject({
      user_id: u,
      product_id: products.program,
      scope_id: program,
    });
    expect(
      (await one<{ e: string }>("select billing_email as e from profiles where id = $1", [u])).e,
    ).toBe("buyer@example.com");
    // An amount in the body is not part of the contract: it is refused, not used.
    const sneaky = await orderRoute(req(u, { productId: products.program, amount: 100 }, rid("k")));
    expect(sneaky.status).toBe(400);
  });

  it("refresh after Checkout grants within the request; a forged signature is refused", async () => {
    const u = await athlete("Refresher");
    const o = razorpayOrderResponseSchema.parse(
      await (await orderRoute(req(u, { productId: products.program }, rid("k")))).json(),
    );
    const payment = rzp.pay(o.orderId, 129900);
    const forged = await refreshRoute(
      req(u, {
        kind: "order",
        orderId: o.orderId,
        paymentId: payment.id,
        signature: "00".repeat(32),
      }),
    );
    expect(forged.status).toBe(400);
    expect(await access(u, "program", program)).toBe(false);

    const signature = signHex(KEY_SECRET, `${o.orderId}|${payment.id}`);
    const started = Date.now();
    const res = await refreshRoute(
      req(u, { kind: "order", orderId: o.orderId, paymentId: payment.id, signature }),
    );
    const body = purchaseRefreshResponseSchema.parse(await res.json());
    expect(body).toEqual({
      status: "granted",
      scope: "program",
      scopeId: program,
      next: `/app/programs/${programSlug}`,
    });
    expect(Date.now() - started).toBeLessThan(5000);
    expect(await access(u, "program", program)).toBe(true);

    // Someone else cannot use this athlete's checkout.
    const other = await athlete("Other");
    const theirs = await refreshRoute(
      req(other, { kind: "order", orderId: o.orderId, paymentId: payment.id, signature }),
    );
    expect(theirs.status).toBe(404);
  });

  it("refresh and webhook racing for one payment: one grant, one entitlement event, one purchase_completed", async () => {
    const u = await athlete("Racer");
    const o = razorpayOrderResponseSchema.parse(
      await (await orderRoute(req(u, { productId: products.program }, rid("k")))).json(),
    );
    const payment = rzp.pay(o.orderId, 129900);
    const signature = signHex(KEY_SECRET, `${o.orderId}|${payment.id}`);
    const before = grants.length;
    const [a, b, c] = await Promise.all([
      refreshRoute(req(u, { kind: "order", orderId: o.orderId, paymentId: payment.id, signature })),
      webhook(delivery("payment.captured", { payment })),
      refreshRoute(req(u, { kind: "order", orderId: o.orderId, paymentId: payment.id, signature })),
    ]);
    expect([a.status, b.status, c.status]).toEqual([200, 200, 200]);
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

  it("what is owned cannot be bought again; a drill needs its drill id and opens only it", async () => {
    const u = await athlete("Owner");
    await admin.query(
      "select grant_entitlement($1, 'program', $2, 'admin', now(), null, null, null, null, 'test')",
      [u, program],
    );
    const again = await orderRoute(req(u, { productId: products.program }, rid("k")));
    expect(again.status).toBe(409);
    expect((await again.json()).details).toEqual({ reason: "already_owned" });
    expect((await orderRoute(req(u, { productId: products.drill }, rid("k")))).status).toBe(400);
    const o = razorpayOrderResponseSchema.parse(
      await (
        await orderRoute(req(u, { productId: products.drill, drillId: drill }, rid("k")))
      ).json(),
    );
    expect(o.amount).toBe(9900);
    const payment = rzp.pay(o.orderId, 9900);
    const refreshed = await refreshRoute(
      req(u, {
        kind: "order",
        orderId: o.orderId,
        paymentId: payment.id,
        signature: signHex(KEY_SECRET, `${o.orderId}|${payment.id}`),
      }),
    );
    expect(purchaseRefreshResponseSchema.parse(await refreshed.json())).toEqual({
      status: "granted",
      scope: "drill",
      scopeId: drill,
      next: "/app",
    });
    expect(await access(u, "drill", drill)).toBe(true);
  });

  it("a subscription: created on the product's plan, granted by refresh, listed, cancelled to period end", async () => {
    const u = await athlete("Subscriber");
    const s = razorpaySubscriptionResponseSchema.parse(
      await (
        await subRoute(req(u, { productId: products.sub, email: "sub@example.com" }, rid("k")))
      ).json(),
    );
    const created = rzp.subscriptions.get(s.subscriptionId)!;
    expect(created).toMatchObject({ plan_id: "plan_q", total_count: 40 });
    const now = epoch(new Date());
    Object.assign(created, { status: "active", current_start: now, current_end: now + 90 * 86400 });
    const payment = rzp.pay(rid("order"), 79900, { invoice_id: rid("inv") });
    const res = await refreshRoute(
      req(u, {
        kind: "subscription",
        subscriptionId: s.subscriptionId,
        paymentId: payment.id,
        signature: signHex(KEY_SECRET, `${payment.id}|${s.subscriptionId}`),
      }),
    );
    expect((await res.json()).status).toBe("granted");
    expect(await access(u, "program", program)).toBe(true);
    expect((await subRoute(req(u, { productId: products.sub }, rid("k")))).status).toBe(409);

    const list = purchasesResponseSchema.parse(await (await listRoute(req(u))).json());
    expect(list.purchases).toHaveLength(1);
    expect(list.purchases[0]).toMatchObject({
      productKind: "subscription",
      amountPaise: 79900,
      entitlementStatus: "active",
    });
    expect(list.subscription).toMatchObject({ providerStatus: "active", renews: true });
    expect(list.billingEmail).toBe("sub@example.com");

    const cancel = await cancelRoute(req(u, {}, rid("k")));
    expect(cancel.status).toBe(200);
    expect(rzp.calls).toContain("cancel:true");
    expect(await access(u, "program", program)).toBe(true);
    const after = purchasesResponseSchema.parse(await (await listRoute(req(u))).json());
    expect(after.subscription).toMatchObject({ renews: false });
    expect(after.subscription!.cancelRequestedAt).not.toBeNull();
  });

  it("without Razorpay keys the purchase routes answer 503", async () => {
    const u = await athlete("No keys");
    const unconfigured = apiRoute(
      {
        name: "POST /purchases/razorpay/order",
        body: razorpayOrderRequestSchema,
        idempotent: true,
        handler: ({ tx, session, body }) =>
          createRazorpayOrder(tx, session, body, { razorpay: undefined, keys: undefined, service }),
      },
      deps,
    );
    const res = await unconfigured(req(u, { productId: products.program }, rid("k")));
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("unavailable");
  });
});
