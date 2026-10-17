import { razorpaySubscriptionRequestSchema } from "@eyeq/api-contract";
import { appDeps } from "@/server/api/deps";
import { apiRoute } from "@/server/api/pipeline";
import { paymentsDeps } from "@/server/payments/deps";
import { createRazorpaySubscription } from "@/server/services/purchases";

/** POST /purchases/razorpay/subscription: EyeQ Pro on a Razorpay plan. */
export const POST = apiRoute(
  {
    name: "POST /purchases/razorpay/subscription",
    body: razorpaySubscriptionRequestSchema,
    idempotent: true,
    handler: ({ tx, session, body }) =>
      createRazorpaySubscription(tx, session, body, paymentsDeps()),
  },
  appDeps,
);
