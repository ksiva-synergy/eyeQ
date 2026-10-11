import { appDeps } from "@/server/api/deps";
import { apiRoute } from "@/server/api/pipeline";
import { getBadges } from "@/server/services/compete";

/** GET /badges: the trophy case, earned and locked, with the rank-title bands (board 9). */
export const GET = apiRoute({ name: "GET /badges", handler: ({ tx }) => getBadges(tx) }, appDeps);
