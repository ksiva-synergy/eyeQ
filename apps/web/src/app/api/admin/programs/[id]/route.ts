import { builderIdParamsSchema, programUpdateSchema } from "@eyeq/api-contract";
import { adminRoute } from "@/server/api/admin";
import { adminDeps } from "@/server/api/deps";
import { getProgram, updateProgram } from "@/server/services/admin/builder";

export const GET = adminRoute(
  {
    name: "GET /admin/programs/:id",
    params: builderIdParamsSchema,
    handler: ({ tx, params }) => getProgram(tx, params.id),
  },
  adminDeps,
);

export const PATCH = adminRoute(
  {
    name: "PATCH /admin/programs/:id",
    params: builderIdParamsSchema,
    body: programUpdateSchema,
    mutation: true,
    handler: ({ tx, params, body, audit }) => updateProgram(tx, params.id, body, audit),
  },
  adminDeps,
);
