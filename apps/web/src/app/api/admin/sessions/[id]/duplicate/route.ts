import { builderIdParamsSchema } from "@eyeq/api-contract";
import { adminRoute } from "@/server/api/admin";
import { adminDeps } from "@/server/api/deps";
import { duplicateSession } from "@/server/services/admin/builder";

export const POST = adminRoute(
  {
    name: "POST /admin/sessions/:id/duplicate",
    params: builderIdParamsSchema,
    mutation: true,
    status: 201,
    handler: ({ tx, params, audit }) => duplicateSession(tx, params.id, audit),
  },
  adminDeps,
);
