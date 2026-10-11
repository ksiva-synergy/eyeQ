import { appDeps } from "@/server/api/deps";
import { apiRoute } from "@/server/api/pipeline";
import { getProgress } from "@/server/services/daily";

export const GET = apiRoute(
  { name: "GET /progress", handler: ({ tx }) => getProgress(tx) },
  appDeps,
);
