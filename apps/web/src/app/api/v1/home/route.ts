import { appDeps } from "@/server/api/deps";
import { apiRoute } from "@/server/api/pipeline";
import { getHome } from "@/server/services/daily";

export const GET = apiRoute({ name: "GET /home", handler: ({ tx }) => getHome(tx) }, appDeps);
