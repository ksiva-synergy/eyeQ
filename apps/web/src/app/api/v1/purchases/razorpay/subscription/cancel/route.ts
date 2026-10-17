import { appDeps } from "@/server/api/deps";
import { apiRoute } from "@/server/api/pipeline";
import { paymentsDeps } from "@/server/payments/deps";
import { cancelSubscription } from "@/server/services/purchases";

/** POST /purchases/razorpay/subscription/cancel: at the end of the paid period. */
export const POST = apiRoute(
  {
    name: "POST /purchases/razorpay/subscription/cancel",
    idempotent: true,
    handler: ({ tx, session }) => cancelSubscription(tx, session, paymentsDeps()),
  },
  appDeps,
);
