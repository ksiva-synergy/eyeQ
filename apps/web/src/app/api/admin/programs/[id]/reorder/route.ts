import { builderIdParamsSchema, reorderSchema } from "@eyeq/api-contract";
import { adminRoute } from "@/server/api/admin";
import { adminDeps } from "@/server/api/deps";
import { reorderProgram } from "@/server/services/admin/builder";

export const POST = adminRoute(
  {
    name: "POST /admin/programs/:id/reorder",
    params: builderIdParamsSchema,
    body: reorderSchema,
    mutation: true,
    handler: ({ tx, params, body, audit }) => reorderProgram(tx, params.id, body, audit),
  },
  adminDeps,
);
