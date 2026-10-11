import { selfRatingsRequestSchema } from "@eyeq/api-contract";
import { appDeps } from "@/server/api/deps";
import { apiRoute } from "@/server/api/pipeline";
import { postSelfRatings } from "@/server/services/daily";

export const POST = apiRoute(
  {
    name: "POST /me/self-ratings",
    body: selfRatingsRequestSchema,
    idempotent: true,
    status: 201,
    handler: ({ tx, session, body }) => postSelfRatings(tx, session.userId, body),
  },
  appDeps,
);
