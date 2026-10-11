import { adminChallengeUpdateSchema, adminIdParamsSchema } from "@eyeq/api-contract";
import { adminRoute } from "@/server/api/admin";
import { adminDeps } from "@/server/api/deps";
import { deleteChallenge, updateChallenge } from "@/server/services/admin/challenges";

export const PATCH = adminRoute(
  {
    name: "PATCH /admin/challenges/:id",
    params: adminIdParamsSchema,
    body: adminChallengeUpdateSchema,
    mutation: true,
    handler: ({ tx, params, body, audit }) => updateChallenge(tx, params.id, body, audit),
  },
  adminDeps,
);

/** Only a challenge that has not started; a weekly one then repeats last week's. */
export const DELETE = adminRoute(
  {
    name: "DELETE /admin/challenges/:id",
    params: adminIdParamsSchema,
    mutation: true,
    handler: ({ tx, params, audit }) => deleteChallenge(tx, params.id, audit),
  },
  adminDeps,
);
