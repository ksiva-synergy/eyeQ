import { programSlugParamsSchema } from "@eyeq/api-contract";
import { appDeps } from "@/server/api/deps";
import { apiRoute } from "@/server/api/pipeline";
import { getProgram } from "@/server/services/content";

export const GET = apiRoute(
  {
    name: "GET /programs/:slug",
    params: programSlugParamsSchema,
    handler: ({ tx, params }) => getProgram(tx, params.slug),
  },
  appDeps,
);
