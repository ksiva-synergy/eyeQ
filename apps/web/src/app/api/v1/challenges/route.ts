import { appDeps } from "@/server/api/deps";
import { apiRoute } from "@/server/api/pipeline";
import { getChallenges } from "@/server/services/compete";

/** GET /challenges: the weekly and program challenges with the athlete's progress (board 7). */
export const GET = apiRoute(
  { name: "GET /challenges", handler: ({ tx }) => getChallenges(tx) },
  appDeps,
);
