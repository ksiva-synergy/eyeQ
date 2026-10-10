import { patchMeRequestSchema } from "@eyeq/api-contract";
import { appDeps } from "@/server/api/deps";
import { apiRoute } from "@/server/api/pipeline";
import { getMe, patchMe } from "@/server/services/me";

export const GET = apiRoute(
  { name: "GET /me", handler: ({ tx, session }) => getMe(tx, session) },
  appDeps,
);

export const PATCH = apiRoute(
  {
    name: "PATCH /me",
    body: patchMeRequestSchema,
    idempotent: true,
    handler: ({ tx, session, body }) => patchMe(tx, session, body),
  },
  appDeps,
);
