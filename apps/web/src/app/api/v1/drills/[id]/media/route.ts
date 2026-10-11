import { drillIdParamsSchema, drillMediaQuerySchema } from "@eyeq/api-contract";
import { appDeps } from "@/server/api/deps";
import { ApiError } from "@/server/api/errors";
import { apiRoute } from "@/server/api/pipeline";
import { getDrillMedia } from "@/server/services/daily";

/** GET /drills/:id/media?session=: the only route that returns a video reference (rule 5). */
export const GET = apiRoute(
  {
    name: "GET /drills/:id/media",
    params: drillIdParamsSchema,
    handler: ({ tx, params, req }) => {
      const query = drillMediaQuerySchema.safeParse(
        Object.fromEntries(new URL(req.url).searchParams),
      );
      if (!query.success) {
        throw new ApiError(400, "validation_failed", "The request is not valid.", {
          issues: query.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        });
      }
      return getDrillMedia(tx, params.id, query.data.session);
    },
  },
  appDeps,
);
