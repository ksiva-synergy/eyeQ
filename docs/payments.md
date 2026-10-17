# Payments on web (Razorpay)

How EyeQ takes payments on the web (plan phase 7), how to set it up in test mode on staging, and how to run the acceptance checks there. Mobile pays through the app stores (phase 9); its entitlements land in the same tables.

The rules this follows: the server decides what a payment grants (ground rule 1), access is only ever `has_access()` over entitlements (rule 4), and every webhook and refresh is idempotent by the provider's ids (rule 6). Event names and fields are the ones read from Razorpay's docs on 2026-10-17, with links, in `DECISIONS.md` (Phase 7).

## How it works

1. **Checkout.** The browser names a product (and, for a pay-per-view drill, the drill). The server prices it from the `products` row, creates a Razorpay order or subscription, and records a `checkouts` row. Razorpay Checkout opens, limited to UPI, card and net banking.
2. **Refresh.** When Checkout's handler fires, the browser posts its response to `POST /api/v1/purchases/refresh`. The server verifies the signature against the id it stored, fetches the payment from Razorpay, and if it is captured, grants. This is what makes a purchase open within seconds.
3. **Webhook.** `POST /api/webhooks/razorpay` verifies `X-Razorpay-Signature` over the raw body, stores the event in `payment_events` (once per `x-razorpay-event-id`), and processes it in the same request. Whichever of the refresh and the webhook arrives first grants; the other changes nothing.
4. **Subscriptions.** On every `subscription.*` event the processor fetches the subscription from Razorpay and sets the entitlement from that state, so events arriving out of order cannot move it backwards:
   - `active`: Pro runs to `current_end`.
   - `pending` (a charge failing while Razorpay retries): grace for `payments.subscription_grace_days` (3) past it.
   - `halted`: Pro ends.
   - `cancelled` or `completed`: Pro runs to `current_end`, then pg_cron's hourly `entitlement-expiry` job ends it.
5. **Refunds and disputes.**
   - A full refund ends what the payment granted at once.
   - A partial refund changes nothing and is flagged (`payment_flags`).
   - A dispute is flagged when opened and ends access when lost.
6. **The sweep.** `GET /api/cron/payments` (every 5 minutes, Vercel Cron) processes any stored event still unprocessed, for example after Razorpay's API failed to answer.

## Setup (test mode, staging)

Set these on Vercel, project `eyeq`, environment **Production** (which is staging until phase 11). Mark the secrets as sensitive. Never give any of them a `NEXT_PUBLIC_` prefix, except the optional key id.

| Variable | Where it comes from | Secret |
| --- | --- | --- |
| `RAZORPAY_KEY_ID` | Razorpay Dashboard, **Test mode**, Account & Settings, API keys (`rzp_test_…`) | no (Checkout needs it; the API hands it to the browser) |
| `RAZORPAY_KEY_SECRET` | same page, shown once when the key is generated | yes |
| `RAZORPAY_WEBHOOK_SECRET` | the secret you type when you add the webhook below | yes |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | optional, same value as `RAZORPAY_KEY_ID`; not needed | no |
| `RESEND_API_KEY`, `EMAIL_FROM` | Resend; without them receipts are skipped and recorded, not sent | key: yes |

Redeploy after setting them. Without the keys the purchase routes answer 503 `unavailable`, and webhooks are refused (500, not stored) until the webhook secret is set.

### Razorpay plans

Subscriptions need a Razorpay Plan per subscription product. From a machine with the test keys and the staging database URL in the environment (the session pooler or direct URL, not port 6543):

```sh
RAZORPAY_KEY_ID=rzp_test_… RAZORPAY_KEY_SECRET=… DIRECT_URL=… pnpm razorpay:sync-plans          # shows what it would do
RAZORPAY_KEY_ID=rzp_test_… RAZORPAY_KEY_SECRET=… DIRECT_URL=… pnpm razorpay:sync-plans --apply  # creates and links
```

It creates one plan per active subscription product: monthly; monthly with interval 3 for quarterly; yearly. It writes each plan's id to `products.razorpay_plan_id` and records an `audit_log` row. Running it again creates nothing. A changed price makes a new plan. It refuses live keys.

Until it has run, the paywall shows "Pro plans open soon" and only one-time purchases work.

### The webhook

In the Razorpay Dashboard, in **Test mode**, go to Account & Settings, Webhooks, and choose **Add new webhook**:

- **URL:** `https://eyeq-nu.vercel.app/api/webhooks/razorpay?x-vercel-protection-bypass=<the project's automation bypass secret>`. The bypass parameter keeps the URL working behind Vercel Authentication (plan 2.4); the route still checks Razorpay's signature.
- **Secret:** a long random value. Put the same value in `RAZORPAY_WEBHOOK_SECRET`.
- **Active events:** tick these 19. Anything else is stored and ignored.
  - Payments and orders: `payment.captured`, `order.paid`
  - Subscriptions: `subscription.authenticated`, `subscription.activated`, `subscription.charged`, `subscription.pending`, `subscription.halted`, `subscription.cancelled`, `subscription.completed`, `subscription.paused`, `subscription.resumed`, `subscription.updated`
  - Refunds: `refund.created`, `refund.processed`, `refund.failed`
  - Disputes: `payment.dispute.created`, `payment.dispute.won`, `payment.dispute.lost`, `payment.dispute.closed`

Payments must be **auto-captured**, which is the Dashboard default (Account & Settings, Payment capture). A payment that is only authorised grants nothing until it is captured.

## GST invoices

EyeQ does not issue its own tax invoices. Prices are tax-inclusive (D21) and the receipt email says the GST tax invoice comes from Razorpay. What is needed before production:

- The legal entity's **GSTIN** in the Razorpay Dashboard, Account & Settings, GST details (owner or admin). Razorpay then shows it on what it issues.
- Razorpay's API creates only non-GST invoices. A GST invoice with HSN/SAC codes and the tax split is made from the Dashboard's Invoices section, and only after the GSTIN is added. If every payment must carry a GST invoice automatically, that is a decision for the accountant: either Razorpay's invoice setup, or invoices EyeQ generates itself with sequential numbers. Neither is built.

This blocks **production** payments, together with the legal entity, Razorpay KYC and real prices (plan section 13, D21). Staging uses test keys and the seed's placeholder prices.

## Acceptance on staging (test mode)

Use Razorpay's test payment details from its docs (test cards and test UPI ids: <https://razorpay.com/docs/payments/payments/test-card-details/>). Sign in with a test number. Each check names what to look at.

Checks marked *(automated)* run in CI with signed fixture payloads (`webhook.integration.test.ts`, `purchases.integration.test.ts`, pgTAP 0040). On staging they only need a look.

1. **A program purchase unlocks within seconds, and on a second browser.**
   1. Signed in as a free athlete, open Programs, then *Cricket Vision Foundations*, then **Unlock program**, and pay with a test card.
   2. The page should land back on the program, open, in a few seconds.
   3. In a second browser (or a private window) signed in as the same athlete, open the program: it is open.
   4. Account, Purchases, Payments should list it as Active.
2. **One pay-per-view drill unlocks only that drill.**
   1. As a free athlete, open Rewards, then **Unlock a drill**. On a drill sold on its own, choose **Unlock this drill · ₹99** and pay.
   2. That drill plays.
   3. Every other drill on the list is still locked, and so is its program.
3. **A subscription renews and extends `ends_at`.**
   1. Open the paywall, choose Monthly, then **Start Pro**, and pay. Pro opens.
   2. Account shows "Renews …".
   3. Razorpay charges the next cycle only after a month, so the renewal itself is covered by the automated test. On staging, check after the first charge that `entitlements.ends_at` equals the subscription's `current_end` in the Razorpay Dashboard.
4. **A cancelled subscription runs to period end, then locks.**
   1. In Account, choose **Cancel Pro**, then **Cancel at period end**.
   2. Pro stays open, and Account says "Cancelled · open until …".
   3. The lock at period end is the hourly `entitlement-expiry` job *(automated, through `cron_run`)*. On staging it happens on that date.
5. **A refund locks at once.**
   1. In the Razorpay Dashboard (Test mode), open the payment from check 1 and refund the full amount.
   2. Within seconds of `refund.processed`, the program is locked again.
   3. A partial refund on another payment changes nothing and adds a `payment_flags` row of kind `partial_refund`.
6. **A replayed webhook changes nothing** *(automated)*. On staging, a delivery Razorpay retries is answered `{"ok":true,"replay":true}` and adds no `entitlement_events` row.
7. **Two events out of order end in the right state** *(automated)*: a late `subscription.pending` after `subscription.charged` leaves Pro active.
8. **A bad signature is refused and logged.** Run:

   ```sh
   curl -s -o /dev/null -w "%{http_code}\n" -X POST \
     "https://eyeq-nu.vercel.app/api/webhooks/razorpay?x-vercel-protection-bypass=<secret>" \
     -H 'content-type: application/json' -H 'x-razorpay-signature: 00' -d '{"event":"payment.captured"}'
   ```

   - It should print `401`.
   - Vercel's runtime log should show `razorpay.webhook_bad_signature`.
   - Sentry should show a `WebhookSignatureRejected` event.
   - No new `payment_events` row should exist.
9. **Webhook and refresh racing for one payment produce one grant and one `entitlement_events` row** *(automated: two refreshes and a webhook in parallel)*. On staging, after check 1, `payment_grants` has one row for that payment.
10. **No access decision outside entitlements** *(automated)*. `server/payments/access-rule.test.ts` reads the source: only the payment layer calls Razorpay; the provider's subscription cache is read only by Account and cancelling; access comes from `has_access()` in SQL.

## Not on mobile yet

Mobile is the missing client for paying (ground rule 17). The app pays through Play and the App Store via RevenueCat in phase 9, and a web purchase already opens there, because access follows the account.
