import { feedReadRequestSchema } from "@eyeq/api-contract";
import { appDeps } from "@/server/api/deps";
import { apiRoute } from "@/server/api/pipeline";
import { markRead } from "@/server/services/notify";

/** POST /notifications/read: marks the given items, or all, read. */
export const POST = apiRoute(
  {
    name: "POST /notifications/read",
    body: feedReadRequestSchema,
    idempotent: true,
    handler: ({ tx, session, body }) => markRead(tx, session.userId, body.ids),
  },
  appDeps,
);
