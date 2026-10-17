import { razorpayOrderRequestSchema } from "@eyeq/api-contract";
import { appDeps } from "@/server/api/deps";
import { apiRoute } from "@/server/api/pipeline";
import { paymentsDeps } from "@/server/payments/deps";
import { createRazorpayOrder } from "@/server/services/purchases";

/** POST /purchases/razorpay/order: a program or one pay-per-view drill, priced by the server. */
export const POST = apiRoute(
  {
    name: "POST /purchases/razorpay/order",
    body: razorpayOrderRequestSchema,
    idempotent: true,
    handler: ({ tx, session, body }) => createRazorpayOrder(tx, session, body, paymentsDeps()),
  },
  appDeps,
);
