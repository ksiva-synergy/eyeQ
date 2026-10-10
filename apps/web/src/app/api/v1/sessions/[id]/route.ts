import { sessionIdParamsSchema } from "@eyeq/api-contract";
import { appDeps } from "@/server/api/deps";
import { apiRoute } from "@/server/api/pipeline";
import { getSession } from "@/server/services/content";

export const GET = apiRoute(
  {
    name: "GET /sessions/:id",
    params: sessionIdParamsSchema,
    handler: ({ tx, params }) => getSession(tx, params.id),
  },
  appDeps,
);
