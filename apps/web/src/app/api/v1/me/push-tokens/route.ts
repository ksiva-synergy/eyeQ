import { pushTokenDeleteSchema, pushTokenRequestSchema } from "@eyeq/api-contract";
import { appDeps } from "@/server/api/deps";
import { apiRoute } from "@/server/api/pipeline";
import { deletePushToken, savePushToken } from "@/server/services/notify";

/** POST /me/push-tokens: a web push subscription now, an Expo token from the app (phase 9). */
export const POST = apiRoute(
  {
    name: "POST /me/push-tokens",
    body: pushTokenRequestSchema,
    idempotent: true,
    status: 201,
    handler: ({ tx, session, body }) => savePushToken(tx, session.userId, body),
  },
  appDeps,
);

/** DELETE /me/push-tokens: the athlete turned notifications off on this device. */
export const DELETE = apiRoute(
  {
    name: "DELETE /me/push-tokens",
    body: pushTokenDeleteSchema,
    idempotent: true,
    handler: async ({ tx, session, body }) => {
      await deletePushToken(tx, session.userId, body.token);
      return { ok: true };
    },
  },
  appDeps,
);
