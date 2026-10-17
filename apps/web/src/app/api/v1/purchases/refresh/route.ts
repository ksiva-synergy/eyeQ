import { purchaseRefreshRequestSchema } from "@eyeq/api-contract";
import { appDeps } from "@/server/api/deps";
import { apiRoute } from "@/server/api/pipeline";
import { paymentsDeps, purchaseCompleted } from "@/server/payments/deps";
import { refreshPurchase } from "@/server/services/purchases";

/**
 * POST /purchases/refresh: after Checkout's handler, verify and grant now rather than wait
 * for the webhook. Idempotent by the provider's payment id (rule 6): a second call, or the
 * webhook arriving first, finds the grant already made and changes nothing.
 */
export const POST = apiRoute(
  {
    name: "POST /purchases/refresh",
    body: purchaseRefreshRequestSchema,
    handler: ({ tx, session, body }) =>
      refreshPurchase(tx, session, body, paymentsDeps(), purchaseCompleted),
  },
  appDeps,
);
