import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  razorpayClient,
  signHex,
  verifyCheckoutSignature,
  verifyWebhookSignature,
} from "./razorpay";

const hmac = (secret: string, data: string) =>
  createHmac("sha256", secret).update(data).digest("hex");

describe("X-Razorpay-Signature", () => {
  const body = '{"entity":"event","event":"payment.captured","payload":{}}';
  it("accepts the hex HMAC-SHA256 of the raw body with the webhook secret", () => {
    expect(verifyWebhookSignature(body, hmac("whsec", body), "whsec")).toBe(true);
  });
  it("refuses a wrong secret, a changed body, a re-serialised body, a missing or malformed header", () => {
    expect(verifyWebhookSignature(body, hmac("other", body), "whsec")).toBe(false);
    expect(verifyWebhookSignature(body + " ", hmac("whsec", body), "whsec")).toBe(false);
    const reserialised = JSON.stringify(JSON.parse(body), null, 1);
    expect(verifyWebhookSignature(reserialised, hmac("whsec", body), "whsec")).toBe(false);
    expect(verifyWebhookSignature(body, null, "whsec")).toBe(false);
    expect(verifyWebhookSignature(body, "not-hex!", "whsec")).toBe(false);
    expect(verifyWebhookSignature(body, hmac("whsec", body).slice(2), "whsec")).toBe(false);
  });
  it("accepts either secret during a rotation", () => {
    expect(verifyWebhookSignature(body, hmac("old", body), "new|old")).toBe(true);
    expect(verifyWebhookSignature(body, hmac("new", body), "new|old")).toBe(true);
  });
});

describe("Checkout handler signatures", () => {
  it("orders sign order_id|payment_id", () => {
    const signature = hmac("ks", "order_1|pay_1");
    expect(
      verifyCheckoutSignature("ks", {
        kind: "order",
        orderId: "order_1",
        paymentId: "pay_1",
        signature,
      }),
    ).toBe(true);
    expect(
      verifyCheckoutSignature("ks", {
        kind: "order",
        orderId: "order_2",
        paymentId: "pay_1",
        signature,
      }),
    ).toBe(false);
  });
  it("subscriptions sign payment_id|subscription_id (payment first)", () => {
    const signature = hmac("ks", "pay_1|sub_1");
    expect(
      verifyCheckoutSignature("ks", {
        kind: "subscription",
        subscriptionId: "sub_1",
        paymentId: "pay_1",
        signature,
      }),
    ).toBe(true);
    expect(
      verifyCheckoutSignature("ks", {
        kind: "subscription",
        subscriptionId: "sub_1",
        paymentId: "pay_1",
        signature: hmac("ks", "sub_1|pay_1"),
      }),
    ).toBe(false);
  });
  it("signHex matches", () => expect(signHex("a", "b")).toBe(hmac("a", "b")));
});

describe("the REST client", () => {
  it("uses Basic auth on api.razorpay.com/v1 and reports errors without ids", async () => {
    const seen: { url: string; auth: string | null; body: unknown }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      seen.push({
        url,
        auth: new Headers(init.headers).get("authorization"),
        body: init.body ? JSON.parse(init.body as string) : undefined,
      });
      if (url.endsWith("/payments/pay_missing"))
        return new Response(
          JSON.stringify({ error: { code: "BAD_REQUEST_ERROR", description: "no such id" } }),
          {
            status: 400,
          },
        );
      return new Response(JSON.stringify({ id: "order_1", entity: "order" }), { status: 200 });
    }) as unknown as typeof fetch;
    const rzp = razorpayClient({ keyId: "rzp_test_k", keySecret: "s" }, fake);
    await rzp.createOrder({ amount: 9900, currency: "INR", receipt: "r", notes: { user_id: "u" } });
    expect(seen[0]).toEqual({
      url: "https://api.razorpay.com/v1/orders",
      auth: `Basic ${Buffer.from("rzp_test_k:s").toString("base64")}`,
      body: { amount: 9900, currency: "INR", receipt: "r", notes: { user_id: "u" } },
    });
    await rzp.cancelSubscription("sub_1", true);
    expect(seen[1]).toMatchObject({
      url: "https://api.razorpay.com/v1/subscriptions/sub_1/cancel",
      body: { cancel_at_cycle_end: true },
    });
    await expect(rzp.fetchPayment("pay_missing")).rejects.toThrow(
      /GET \/payments\/:id failed: 400 no such id/,
    );
  });
});
