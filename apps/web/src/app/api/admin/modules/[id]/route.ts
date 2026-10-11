import { builderIdParamsSchema, moduleUpdateSchema } from "@eyeq/api-contract";
import { adminRoute } from "@/server/api/admin";
import { adminDeps } from "@/server/api/deps";
import { deleteModule, updateModule } from "@/server/services/admin/builder";

export const PATCH = adminRoute(
  {
    name: "PATCH /admin/modules/:id",
    params: builderIdParamsSchema,
    body: moduleUpdateSchema,
    mutation: true,
    handler: ({ tx, params, body, audit }) => updateModule(tx, params.id, body, audit),
  },
  adminDeps,
);

export const DELETE = adminRoute(
  {
    name: "DELETE /admin/modules/:id",
    params: builderIdParamsSchema,
    mutation: true,
    handler: ({ tx, params, audit }) => deleteModule(tx, params.id, audit),
  },
  adminDeps,
);
