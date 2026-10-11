import { appDeps } from "@/server/api/deps";
import { apiRoute } from "@/server/api/pipeline";
import { getFeed } from "@/server/services/notify";

/** GET /notifications: the in-app feed (plan 6.9, D29), so nothing depends on push alone. */
export const GET = apiRoute(
  { name: "GET /notifications", handler: ({ tx, session }) => getFeed(tx, session.userId) },
  appDeps,
);
