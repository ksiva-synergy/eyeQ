import { appDeps } from "@/server/api/deps";
import { apiRoute } from "@/server/api/pipeline";
import { listPrograms } from "@/server/services/content";

export const GET = apiRoute(
  { name: "GET /programs", handler: ({ tx }) => listPrograms(tx) },
  appDeps,
);
