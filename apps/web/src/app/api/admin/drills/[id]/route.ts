import { builderIdParamsSchema, drillUpdateSchema } from "@eyeq/api-contract";
import { adminRoute } from "@/server/api/admin";
import { adminDeps } from "@/server/api/deps";
import { updateDrill } from "@/server/services/admin/builder";
import { linkChecker } from "@/server/services/admin/link-check";

export const PATCH = adminRoute(
  {
    name: "PATCH /admin/drills/:id",
    params: builderIdParamsSchema,
    body: drillUpdateSchema,
    mutation: true,
    handler: ({ tx, params, body, audit }) =>
      updateDrill(tx, linkChecker(), params.id, body, audit),
  },
  adminDeps,
);
