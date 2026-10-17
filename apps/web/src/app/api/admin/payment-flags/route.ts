import { adminRoute } from "@/server/api/admin";
import { adminDeps } from "@/server/api/deps";
import { listPaymentFlags } from "@/server/services/admin/payments";

/** Payments to review: partial refunds, disputes and unmatched payments (phase 7). */
export const GET = adminRoute(
  { name: "GET /admin/payment-flags", handler: ({ tx }) => listPaymentFlags(tx) },
  adminDeps,
);
