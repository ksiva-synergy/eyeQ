import { leaderboardQuerySchema } from "@eyeq/api-contract";
import { appDeps } from "@/server/api/deps";
import { ApiError } from "@/server/api/errors";
import { apiRoute } from "@/server/api/pipeline";
import { getLeaderboard } from "@/server/services/compete";

/** GET /leaderboards?period=week|all&scope=global|sport (plan 6.6, board 6). */
export const GET = apiRoute(
  {
    name: "GET /leaderboards",
    handler: ({ tx, req }) => {
      const q = leaderboardQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
      if (!q.success)
        throw new ApiError(400, "validation_failed", "The request is not valid.", {
          issues: q.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        });
      return getLeaderboard(tx, q.data);
    },
  },
  appDeps,
);
