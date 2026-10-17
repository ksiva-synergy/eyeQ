import { adminIdParamsSchema } from "@eyeq/api-contract";
import { adminRoute } from "@/server/api/admin";
import { adminDeps } from "@/server/api/deps";
import { resolvePaymentFlag } from "@/server/services/admin/payments";

/** Marks a flag looked at; changes no access (a refund or dispute decides that). */
export const POST = adminRoute(
  {
    name: "POST /admin/payment-flags/:id/resolve",
    params: adminIdParamsSchema,
    mutation: true,
    handler: ({ tx, params, admin, audit }) =>
      resolvePaymentFlag(tx, params.id, admin.userId, audit),
  },
  adminDeps,
);
