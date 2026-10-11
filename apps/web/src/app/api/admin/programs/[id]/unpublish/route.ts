import { builderIdParamsSchema } from "@eyeq/api-contract";
import { adminRoute } from "@/server/api/admin";
import { adminDeps } from "@/server/api/deps";
import { unpublishProgram } from "@/server/services/admin/builder";

export const POST = adminRoute(
  {
    name: "POST /admin/programs/:id/unpublish",
    params: builderIdParamsSchema,
    mutation: true,
    handler: ({ tx, params, audit }) => unpublishProgram(tx, params.id, audit),
  },
  adminDeps,
);
