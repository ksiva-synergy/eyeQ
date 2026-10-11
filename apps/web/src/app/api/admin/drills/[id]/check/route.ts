import { builderIdParamsSchema } from "@eyeq/api-contract";
import { adminRoute } from "@/server/api/admin";
import { adminDeps } from "@/server/api/deps";
import { recheckDrill } from "@/server/services/admin/builder";
import { linkChecker } from "@/server/services/admin/link-check";

export const POST = adminRoute(
  {
    name: "POST /admin/drills/:id/check",
    params: builderIdParamsSchema,
    mutation: true,
    handler: ({ tx, params, audit }) => recheckDrill(tx, linkChecker(), params.id, audit),
  },
  adminDeps,
);
