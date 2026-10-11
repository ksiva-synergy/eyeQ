import { drillIdParamsSchema } from "@eyeq/api-contract";
import { appDeps } from "@/server/api/deps";
import { apiRoute } from "@/server/api/pipeline";
import { getDrill } from "@/server/services/daily";

export const GET = apiRoute(
  {
    name: "GET /drills/:id",
    params: drillIdParamsSchema,
    handler: ({ tx, params }) => getDrill(tx, params.id),
  },
  appDeps,
);
