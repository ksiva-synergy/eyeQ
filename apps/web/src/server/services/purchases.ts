import type { PrismaClient, Tx } from "@eyeq/db";
import type {
  PurchaseProductsResponse,
  PurchaseRefreshRequest,
  PurchaseRefreshResponse,
  PurchasesResponse,
  RazorpayOrderRequest,
  RazorpayOrderResponse,
  RazorpaySubscriptionRequest,
  RazorpaySubscriptionResponse,
  SubscriptionCancelResponse,
} from "@eyeq/api-contract";
import { ApiError } from "../api/errors";
import type { Session } from "../auth/session";
import { log } from "../observability/log";
import { applyCapturedPayment, applySubscription, type GrantResult } from "../payments/process";
import { RazorpayError, verifyCheckoutSignature, type Razorpay } from "../payments/razorpay";

/**
 * Checkout on web (plan phase 7). Runs as eyeq_api inside the request transaction, so the
 * athlete can create checkouts for themselves only (RLS). The amount always comes from
 * the product row (the client names a product, never a price). Granting runs as
 * eyeq_service through the same SQL as the webhook, so whichever arrives first grants and
 * the other is a no-op.
 */
export interface PaymentsDeps {
  razorpay: Razorpay | undefined;
  keys: { keyId: string; keySecret: string } | undefined;
  /** eyeq_service, for the grant path. */
  service: PrismaClient;
  now?: () => Date;
}

const BRAND = "EyeQ by Forge Your Peak";

function configured(deps: PaymentsDeps): { razorpay: Razorpay; keyId: string; keySecret: string } {
  if (!deps.razorpay || !deps.keys)
    throw new ApiError(503, "unavailable", "Payments are not available right now.", {
      reason: "payments_not_configured",
    });
  return { razorpay: deps.razorpay, ...deps.keys };
}

async function provider<T>(what: string, f: () => Promise<T>): Promise<T> {
  try {
    return await f();
  } catch (e) {
    log("error", "razorpay.call_failed", {
      what,
      status: e instanceof RazorpayError ? e.status : undefined,
      error: String(e),
    });
    throw new ApiError(502, "unavailable", "The payment provider did not answer. Try again.", {
      reason: "provider_error",
    });
  }
}

type DurationGrants = { duration_days?: number; scope?: string };

export async function listPurchaseProducts(tx: Tx): Promise<PurchaseProductsResponse> {
  const products = await tx.products.findMany({
    where: { active: true, kind: { in: ["subscription", "program", "drill"] } },
    orderBy: [{ kind: "asc" }, { price_paise: "asc" }],
  });
  const programs = await tx.programs.findMany({
    where: { product_id: { in: products.map((p) => p.id) } },
    select: { id: true, slug: true, product_id: true },
  });
  const [ents] = await tx.$queryRaw<
    { r: { scope: string; status: string; ends_at: string | null }[] }[]
  >`
    select my_entitlements() as r`;
  const sub = (ents?.r ?? []).find((e) => e.scope === "subscription");
  return {
    products: products
      .filter((p) => p.kind !== "program" || programs.some((g) => g.product_id === p.id))
      .map((p) => {
        const program = programs.find((g) => g.product_id === p.id) ?? null;
        return {
          id: p.id,
          kind: p.kind as "subscription" | "program" | "drill",
          title: p.title,
          pricePaise: p.price_paise,
          currency: p.currency,
          durationDays: (p.grants as DurationGrants).duration_days ?? null,
          programId: program?.id ?? null,
          programSlug: program?.slug ?? null,
          available: p.kind !== "subscription" || p.razorpay_plan_id !== null,
        };
      }),
    subscription: sub
      ? {
          status: sub.status as "active" | "grace",
          endsAt: sub.ends_at ? new Date(sub.ends_at).toISOString() : null,
        }
      : null,
  };
}

/** Stores the receipt email when given; returns the one to prefill. */
async function receiptEmail(
  tx: Tx,
  session: Session,
  email: string | undefined,
): Promise<string | null> {
  if (email) {
    await tx.profiles.update({ where: { id: session.userId }, data: { billing_email: email } });
    return email;
  }
  const p = await tx.profiles.findUnique({
    where: { id: session.userId },
    select: { billing_email: true },
  });
  return p?.billing_email ?? session.email ?? null;
}

async function hasLiveSubscription(tx: Tx): Promise<boolean> {
  const [r] = await tx.$queryRaw<{ r: { scope: string }[] }[]>`select my_entitlements() as r`;
  return (r?.r ?? []).some((e) => e.scope === "subscription");
}

export async function createRazorpayOrder(
  tx: Tx,
  session: Session,
  body: RazorpayOrderRequest,
  deps: PaymentsDeps,
): Promise<RazorpayOrderResponse> {
  const product = await tx.products.findFirst({ where: { id: body.productId, active: true } });
  if (!product || (product.kind !== "program" && product.kind !== "drill"))
    throw new ApiError(404, "not_found", "That product is not on sale.");

  let scope: "program" | "drill";
  let scopeId: string;
  let description: string;
  if (product.kind === "program") {
    const program = await tx.programs.findFirst({ where: { product_id: product.id } });
    if (!program) throw new ApiError(404, "not_found", "That program is not on sale.");
    const [d] = await tx.$queryRaw<{ r: { has_access?: boolean } | null }[]>`
      select program_detail(${program.slug}) as r`;
    if (d?.r?.has_access)
      throw new ApiError(409, "conflict", "You already have this program.", {
        reason: "already_owned",
      });
    scope = "program";
    scopeId = program.id;
    description = program.title;
  } else {
    if (!body.drillId)
      throw new ApiError(400, "validation_failed", "Say which drill to unlock.", {
        issues: [{ path: "drillId", message: "Required for a drill." }],
      });
    const drill = await tx.drills.findFirst({
      where: { id: body.drillId, ppv_product_id: product.id, access: "ppv" },
      select: { id: true, title: true },
    });
    if (!drill) throw new ApiError(404, "not_found", "That drill is not sold on its own.");
    const [d] = await tx.$queryRaw<{ r: { locked?: boolean } | null }[]>`
      select drill_detail(${drill.id}::uuid) as r`;
    if (d?.r && d.r.locked === false)
      throw new ApiError(409, "conflict", "You can already open this drill.", {
        reason: "already_owned",
      });
    scope = "drill";
    scopeId = drill.id;
    description = drill.title;
  }

  const rzp = configured(deps);
  const email = await receiptEmail(tx, session, body.email);
  const checkoutId = crypto.randomUUID();
  const order = await provider("createOrder", () =>
    rzp.razorpay.createOrder({
      amount: product.price_paise,
      currency: product.currency,
      receipt: checkoutId.replace(/-/g, "").slice(0, 32),
      notes: {
        user_id: session.userId,
        product_id: product.id,
        scope_id: scopeId,
        checkout_id: checkoutId,
      },
    }),
  );
  await tx.checkouts.create({
    data: {
      id: checkoutId,
      user_id: session.userId,
      product_id: product.id,
      kind: "order",
      scope,
      scope_id: scopeId,
      external_id: order.id,
      amount_paise: product.price_paise,
      currency: product.currency,
      surface: body.surface ?? null,
    },
  });
  return {
    checkoutId,
    keyId: rzp.keyId,
    name: BRAND,
    description,
    orderId: order.id,
    amount: product.price_paise,
    currency: product.currency,
    prefill: { contact: session.phone, email },
  };
}

export async function createRazorpaySubscription(
  tx: Tx,
  session: Session,
  body: RazorpaySubscriptionRequest,
  deps: PaymentsDeps,
): Promise<RazorpaySubscriptionResponse> {
  const product = await tx.products.findFirst({
    where: { id: body.productId, active: true, kind: "subscription" },
  });
  if (!product) throw new ApiError(404, "not_found", "That plan is not on sale.");
  if (!product.razorpay_plan_id)
    throw new ApiError(503, "unavailable", "This plan cannot be bought yet.", {
      reason: "no_plan",
    });
  if (await hasLiveSubscription(tx))
    throw new ApiError(409, "conflict", "You already have EyeQ Pro.", {
      reason: "already_subscribed",
    });
  const days = String((product.grants as DurationGrants).duration_days ?? "");
  const [cfg] = await tx.$queryRaw<{ v: Record<string, number> | null }[]>`
    select config_value('payments.subscription_total_count') as v`;
  const totalCount = cfg?.v?.[days];
  if (!totalCount)
    throw new ApiError(503, "unavailable", "This plan cannot be bought yet.", {
      reason: "no_count",
    });

  const rzp = configured(deps);
  const email = await receiptEmail(tx, session, body.email);
  const checkoutId = crypto.randomUUID();
  const sub = await provider("createSubscription", () =>
    rzp.razorpay.createSubscription({
      plan_id: product.razorpay_plan_id!,
      total_count: totalCount,
      customer_notify: true,
      notes: { user_id: session.userId, product_id: product.id, checkout_id: checkoutId },
    }),
  );
  await tx.checkouts.create({
    data: {
      id: checkoutId,
      user_id: session.userId,
      product_id: product.id,
      kind: "subscription",
      scope: "subscription",
      scope_id: null,
      external_id: sub.id,
      amount_paise: product.price_paise,
      currency: product.currency,
      surface: body.surface ?? null,
    },
  });
  return {
    checkoutId,
    keyId: rzp.keyId,
    name: BRAND,
    description: product.title,
    subscriptionId: sub.id,
    prefill: { contact: session.phone, email },
  };
}

/** A program opens on its page; Pro and a single drill return to Today (the page that sold a drill reloads itself). */
function nextFor(scope: string, slug: string | null): string {
  if (scope === "program" && slug) return `/app/programs/${slug}`;
  return "/app";
}

/**
 * After Checkout's handler: verify its signature against the id WE stored, fetch the
 * payment (or subscription) from Razorpay, and if captured run the webhook's grant path.
 * `onGrant` (purchase_completed) runs only when this call made the grant.
 */
export async function refreshPurchase(
  tx: Tx,
  session: Session,
  body: PurchaseRefreshRequest,
  deps: PaymentsDeps,
  onGrant: (r: GrantResult) => Promise<void>,
): Promise<PurchaseRefreshResponse> {
  const rzp = configured(deps);
  const externalId = body.kind === "order" ? body.orderId : body.subscriptionId;
  const checkout = await tx.checkouts.findFirst({
    where: {
      provider: "razorpay",
      external_id: externalId,
      user_id: session.userId,
      kind: body.kind,
    },
  });
  if (!checkout) throw new ApiError(404, "not_found", "That checkout is not yours.");
  const ok =
    body.kind === "order"
      ? verifyCheckoutSignature(rzp.keySecret, {
          kind: "order",
          orderId: checkout.external_id,
          paymentId: body.paymentId,
          signature: body.signature,
        })
      : verifyCheckoutSignature(rzp.keySecret, {
          kind: "subscription",
          subscriptionId: checkout.external_id,
          paymentId: body.paymentId,
          signature: body.signature,
        });
  if (!ok) {
    log("warn", "razorpay.checkout_bad_signature", {
      userId: session.userId,
      checkoutId: checkout.id,
    });
    throw new ApiError(400, "validation_failed", "The payment could not be verified.", {
      reason: "bad_signature",
    });
  }
  const at = deps.now?.() ?? new Date();
  const payment = await provider("fetchPayment", () => rzp.razorpay.fetchPayment(body.paymentId));
  let result: GrantResult;
  if (body.kind === "order") {
    if (payment.order_id !== checkout.external_id)
      throw new ApiError(400, "validation_failed", "The payment is for another order.", {
        reason: "mismatch",
      });
    if (payment.status !== "captured")
      return {
        status: "pending",
        scope: checkout.scope as "program" | "drill",
        scopeId: checkout.scope_id,
        next: "/app/account",
      };
    result = await deps.service.$transaction((s) =>
      applyCapturedPayment(s, payment, "refresh", null, at),
    );
  } else {
    const sub = await provider("fetchSubscription", () =>
      rzp.razorpay.fetchSubscription(checkout.external_id),
    );
    result = await deps.service.$transaction((s) =>
      applySubscription(
        s,
        sub,
        payment.status === "captured" ? payment : null,
        "refresh",
        null,
        at,
      ),
    );
    if (sub.status !== "active")
      return { status: "pending", scope: "subscription", scopeId: null, next: "/app/account" };
  }
  if (result.granted) {
    try {
      await onGrant(result);
    } catch (e) {
      log("warn", "razorpay.on_grant_failed", { checkoutId: checkout.id, error: String(e) });
    }
  }
  const program =
    checkout.scope === "program" && checkout.scope_id
      ? await tx.programs.findUnique({ where: { id: checkout.scope_id }, select: { slug: true } })
      : null;
  return {
    status: "granted",
    scope: checkout.scope as "subscription" | "program" | "drill",
    scopeId: checkout.scope_id,
    next: nextFor(checkout.scope, program?.slug ?? null),
  };
}

/** Cancel at the end of the paid period: Pro stays until then, then the expiry job ends it. */
export async function cancelSubscription(
  tx: Tx,
  session: Session,
  deps: PaymentsDeps,
): Promise<SubscriptionCancelResponse> {
  const rzp = configured(deps);
  const live = await tx.provider_subscriptions.findFirst({
    where: { user_id: session.userId, status: { in: ["active", "authenticated", "pending"] } },
    orderBy: { synced_at: "desc" },
  });
  if (!live) throw new ApiError(404, "not_found", "No subscription to cancel.");
  const at = deps.now?.() ?? new Date();
  await provider("cancelSubscription", () =>
    rzp.razorpay.cancelSubscription(live.external_id, true),
  );
  const sub = await provider("fetchSubscription", () =>
    rzp.razorpay.fetchSubscription(live.external_id),
  );
  const r = await deps.service.$transaction(async (s) => {
    await s.provider_subscriptions.update({
      where: { provider_external_id: { provider: "razorpay", external_id: live.external_id } },
      data: { cancel_requested_at: at },
    });
    await s.audit_log.create({
      data: {
        actor_id: session.userId,
        actor_role: "athlete",
        action: "subscription.cancel",
        target_type: "subscription",
        target_id: live.external_id,
      },
    });
    return applySubscription(s, sub, null, "refresh", null, at);
  });
  return {
    endsAt: r.ends_at
      ? new Date(r.ends_at).toISOString()
      : sub.current_end
        ? new Date(sub.current_end * 1000).toISOString()
        : null,
    providerStatus: sub.status,
  };
}

export async function listPurchases(tx: Tx, session: Session): Promise<PurchasesResponse> {
  // A left join: a product the coach has since retired (not readable as eyeq_api) still
  // lists its payment.
  const grants = await tx.$queryRaw<
    {
      payment_id: string;
      kind: string | null;
      title: string | null;
      scope: string;
      amount_paise: number;
      currency: string;
      created_at: Date;
      status: string;
      ends_at: Date | null;
    }[]
  >`
    select g.payment_id, pr.kind, pr.title, c.scope, g.amount_paise, c.currency, g.created_at, e.status, e.ends_at
    from payment_grants g
    join checkouts c on c.id = g.checkout_id
    join entitlements e on e.id = g.entitlement_id
    left join products pr on pr.id = c.product_id
    where g.user_id = ${session.userId}::uuid
    order by g.created_at desc`;
  const sub = await tx.provider_subscriptions.findFirst({
    where: { user_id: session.userId },
    orderBy: { synced_at: "desc" },
  });
  const profile = await tx.profiles.findUnique({
    where: { id: session.userId },
    select: { billing_email: true },
  });
  return {
    purchases: grants.map((g) => ({
      paymentId: g.payment_id,
      productKind: (g.kind ?? g.scope) as PurchasesResponse["purchases"][number]["productKind"],
      title: g.title ?? "",
      amountPaise: g.amount_paise,
      currency: g.currency,
      paidAt: g.created_at.toISOString(),
      entitlementStatus: g.status as "active" | "grace" | "ended",
      endsAt: g.ends_at?.toISOString() ?? null,
    })),
    subscription: sub
      ? {
          subscriptionId: sub.external_id,
          providerStatus: sub.status,
          renews:
            ["active", "authenticated", "pending"].includes(sub.status) && !sub.cancel_requested_at,
          currentEnd: sub.current_end?.toISOString() ?? null,
          cancelRequestedAt: sub.cancel_requested_at?.toISOString() ?? null,
        }
      : null,
    billingEmail: profile?.billing_email ?? null,
  };
}
