import { adminAthleteParamsSchema, adminGrantSchema } from "@eyeq/api-contract";
import { adminRoute } from "@/server/api/admin";
import { adminDeps } from "@/server/api/deps";
import { grantEntitlement } from "@/server/services/admin/athletes";

export const POST = adminRoute(
  {
    name: "POST /admin/athletes/:id/entitlements",
    params: adminAthleteParamsSchema,
    body: adminGrantSchema,
    mutation: true,
    status: 201,
    handler: ({ tx, admin, params, body, audit }) =>
      grantEntitlement(tx, admin, params.id, body, audit),
  },
  adminDeps,
);
