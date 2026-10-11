import { appDeps } from "@/server/api/deps";
import { apiRoute } from "@/server/api/pipeline";
import { getRewards } from "@/server/services/compete";

/** GET /rewards: coin balance, the spends and the drills a coin unlock can open (board 12). */
export const GET = apiRoute({ name: "GET /rewards", handler: ({ tx }) => getRewards(tx) }, appDeps);
