import { appDeps } from "@/server/api/deps";
import { apiRoute } from "@/server/api/pipeline";
import { listPurchases } from "@/server/services/purchases";

/** GET /purchases: the athlete's payments and what each bought, and their subscription (Account). */
export const GET = apiRoute(
  { name: "GET /purchases", handler: ({ tx, session }) => listPurchases(tx, session) },
  appDeps,
);
