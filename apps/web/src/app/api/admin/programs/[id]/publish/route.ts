import { builderIdParamsSchema } from "@eyeq/api-contract";
import { adminRoute } from "@/server/api/admin";
import { adminDeps } from "@/server/api/deps";
import { publishProgram } from "@/server/services/admin/builder";

export const POST = adminRoute(
  {
    name: "POST /admin/programs/:id/publish",
    params: builderIdParamsSchema,
    mutation: true,
    handler: ({ tx, params, audit }) => publishProgram(tx, params.id, audit),
  },
  adminDeps,
);
