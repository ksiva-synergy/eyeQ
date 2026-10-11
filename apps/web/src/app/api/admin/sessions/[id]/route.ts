import { builderIdParamsSchema, sessionUpdateSchema } from "@eyeq/api-contract";
import { adminRoute } from "@/server/api/admin";
import { adminDeps } from "@/server/api/deps";
import { deleteSession, updateSession } from "@/server/services/admin/builder";

export const PATCH = adminRoute(
  {
    name: "PATCH /admin/sessions/:id",
    params: builderIdParamsSchema,
    body: sessionUpdateSchema,
    mutation: true,
    handler: ({ tx, params, body, audit }) => updateSession(tx, params.id, body, audit),
  },
  adminDeps,
);

export const DELETE = adminRoute(
  {
    name: "DELETE /admin/sessions/:id",
    params: builderIdParamsSchema,
    mutation: true,
    handler: ({ tx, params, audit }) => deleteSession(tx, params.id, audit),
  },
  adminDeps,
);
