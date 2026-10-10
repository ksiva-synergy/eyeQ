import { adminEntitlementParamsSchema, adminRevokeSchema } from "@eyeq/api-contract";
import { adminRoute } from "@/server/api/admin";
import { adminDeps } from "@/server/api/deps";
import { revokeEntitlement } from "@/server/services/admin/athletes";

export const POST = adminRoute(
  {
    name: "POST /admin/athletes/:id/entitlements/:entitlementId/revoke",
    params: adminEntitlementParamsSchema,
    body: adminRevokeSchema,
    mutation: true,
    handler: ({ tx, admin, params, body, audit }) =>
      revokeEntitlement(tx, admin, params.id, params.entitlementId, body.reason, audit),
  },
  adminDeps,
);
