import { builderIdParamsSchema, sessionCreateSchema } from "@eyeq/api-contract";
import { adminRoute } from "@/server/api/admin";
import { adminDeps } from "@/server/api/deps";
import { createSession } from "@/server/services/admin/builder";

export const POST = adminRoute(
  {
    name: "POST /admin/modules/:id/sessions",
    params: builderIdParamsSchema,
    body: sessionCreateSchema,
    mutation: true,
    status: 201,
    handler: ({ tx, params, body, audit }) => createSession(tx, params.id, body, audit),
  },
  adminDeps,
);
