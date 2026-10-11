import { builderIdParamsSchema, moduleCreateSchema } from "@eyeq/api-contract";
import { adminRoute } from "@/server/api/admin";
import { adminDeps } from "@/server/api/deps";
import { createModule } from "@/server/services/admin/builder";

export const POST = adminRoute(
  {
    name: "POST /admin/programs/:id/modules",
    params: builderIdParamsSchema,
    body: moduleCreateSchema,
    mutation: true,
    status: 201,
    handler: ({ tx, params, body, audit }) => createModule(tx, params.id, body, audit),
  },
  adminDeps,
);
