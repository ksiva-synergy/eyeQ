"use client";

import { useCallback, useRef, useState } from "react";
import type {
  CheckoutSurface,
  PurchaseRefreshResponse,
  RazorpayOrderResponse,
  RazorpaySubscriptionResponse,
} from "@eyeq/api-contract";
import { t } from "@eyeq/i18n";
import { v1 } from "@/lib/athlete-api";
import { clientId } from "@/lib/client-id";

/**
 * Razorpay Standard Checkout on web (plan 8.2: UPI, card and net banking on web only).
 * The server creates the order or subscription from the product id and answers with the
 * options Checkout needs; the browser opens Checkout, then posts its handler response to
 * POST /purchases/refresh, which verifies and grants at once, and finally loads where the
 * server says (a full load, so every page reads the new entitlement).
 */
const SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

type RazorpayHandlerResponse = {
  razorpay_payment_id: string;
  razorpay_order_id?: string;
  razorpay_subscription_id?: string;
  razorpay_signature: string;
};
type RazorpayInstance = {
  open(): void;
  on(event: "payment.failed", cb: (r: { error?: { description?: string } }) => void): void;
};
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

let loading: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (typeof window !== "undefined" && window.Razorpay) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error("checkout script failed"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/** Only the three methods the paywall names (Razorpay's `config.display` blocks). */
const DISPLAY = {
  display: {
    blocks: {
      eyeq: {
        name: "UPI, card or net banking",
        instruments: [{ method: "upi" }, { method: "card" }, { method: "netbanking" }],
      },
    },
    sequence: ["block.eyeq"],
    preferences: { show_default_blocks: false },
  },
};

export type CheckoutRequest =
  | { kind: "order"; productId: string; drillId?: string; email?: string; surface: CheckoutSurface }
  | { kind: "subscription"; productId: string; email?: string; surface: CheckoutSurface };

export type CheckoutState =
  | { phase: "idle" }
  | { phase: "starting" }
  | { phase: "open" }
  | { phase: "verifying" }
  | { phase: "pending" }
  | { phase: "error"; message: string };

function messageFor(code: string, reason: unknown): string {
  if (reason === "already_owned") return t("pay.error.owned");
  if (reason === "already_subscribed") return t("pay.error.subscribed");
  if (code === "unavailable") return t("pay.error.unavailable");
  if (code === "network") return t("pay.error.network");
  return t("pay.error.generic");
}

export function useCheckout(opts: { onDone?: (next: string) => void } = {}) {
  const [state, setState] = useState<CheckoutState>({ phase: "idle" });
  // One idempotency key per attempt, reused if the same attempt is retried (rule 6).
  const key = useRef<string | null>(null);

  const start = useCallback(
    async (req: CheckoutRequest) => {
      setState({ phase: "starting" });
      key.current ??= clientId();
      const script = loadScript().catch(() => null);
      const { kind, ...body } = req;
      const created =
        kind === "order"
          ? await v1<RazorpayOrderResponse>("POST", "/purchases/razorpay/order", body, {
              idempotencyKey: key.current,
            })
          : await v1<RazorpaySubscriptionResponse>(
              "POST",
              "/purchases/razorpay/subscription",
              body,
              { idempotencyKey: key.current },
            );
      if (!created.ok) {
        if (created.status < 500 && created.status !== 0) key.current = null;
        setState({
          phase: "error",
          message: messageFor(created.code, created.details?.["reason"]),
        });
        return;
      }
      await script;
      if (!window.Razorpay) {
        setState({ phase: "error", message: t("pay.error.script") });
        return;
      }
      const o = created.data;
      key.current = null; // the order exists; a new attempt needs a new one (Razorpay's rule)
      const done = (next: string) => {
        if (opts.onDone) opts.onDone(next);
        // A full load, so every page reads the new entitlement.
        else window.location.assign(next);
      };
      const rzp = new window.Razorpay({
        key: o.keyId,
        name: o.name,
        description: o.description,
        ...("orderId" in o
          ? { order_id: o.orderId, amount: o.amount, currency: o.currency }
          : { subscription_id: o.subscriptionId }),
        prefill: {
          ...(o.prefill.contact ? { contact: o.prefill.contact } : {}),
          ...(o.prefill.email ? { email: o.prefill.email } : {}),
        },
        notes: { checkout_id: o.checkoutId },
        theme: { color: "#7C3AED" },
        config: DISPLAY,
        modal: { ondismiss: () => setState({ phase: "idle" }) },
        handler: async (r: RazorpayHandlerResponse) => {
          setState({ phase: "verifying" });
          const refresh = await v1<PurchaseRefreshResponse>(
            "POST",
            "/purchases/refresh",
            "orderId" in o
              ? {
                  kind: "order",
                  orderId: o.orderId,
                  paymentId: r.razorpay_payment_id,
                  signature: r.razorpay_signature,
                }
              : {
                  kind: "subscription",
                  subscriptionId: o.subscriptionId,
                  paymentId: r.razorpay_payment_id,
                  signature: r.razorpay_signature,
                },
          );
          if (refresh.ok && refresh.data.status === "granted") return done(refresh.data.next);
          // Paid but not confirmed yet (or the refresh failed): the webhook grants it.
          setState({ phase: "pending" });
        },
      });
      rzp.on("payment.failed", () => setState({ phase: "error", message: t("pay.error.failed") }));
      setState({ phase: "open" });
      rzp.open();
    },
    [opts],
  );

  return { state, start, busy: state.phase === "starting" || state.phase === "verifying" };
}
