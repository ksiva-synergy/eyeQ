import { builderIdParamsSchema, sessionDrillAddSchema } from "@eyeq/api-contract";
import { adminRoute } from "@/server/api/admin";
import { adminDeps } from "@/server/api/deps";
import { addSessionDrill } from "@/server/services/admin/builder";
import { linkChecker } from "@/server/services/admin/link-check";

export const POST = adminRoute(
  {
    name: "POST /admin/sessions/:id/drills",
    params: builderIdParamsSchema,
    body: sessionDrillAddSchema,
    mutation: true,
    status: 201,
    handler: ({ tx, params, body, audit }) =>
      addSessionDrill(tx, linkChecker(), params.id, body, audit),
  },
  adminDeps,
);
