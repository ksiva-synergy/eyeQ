import { appDeps } from "@/server/api/deps";
import { apiRoute } from "@/server/api/pipeline";
import { getEntitlements } from "@/server/services/daily";

export const GET = apiRoute(
  { name: "GET /me/entitlements", handler: ({ tx }) => getEntitlements(tx) },
  appDeps,
);
