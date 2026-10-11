import { sessionDrillParamsSchema } from "@eyeq/api-contract";
import { adminRoute } from "@/server/api/admin";
import { adminDeps } from "@/server/api/deps";
import { removeSessionDrill } from "@/server/services/admin/builder";

export const DELETE = adminRoute(
  {
    name: "DELETE /admin/sessions/:id/drills/:drillId",
    params: sessionDrillParamsSchema,
    mutation: true,
    handler: ({ tx, params, audit }) => removeSessionDrill(tx, params.id, params.drillId, audit),
  },
  adminDeps,
);
