import { adminIdParamsSchema, adminProgramChallengeCreateSchema } from "@eyeq/api-contract";
import { adminRoute } from "@/server/api/admin";
import { adminDeps } from "@/server/api/deps";
import { createProgramChallenge, programChallenges } from "@/server/services/admin/challenges";

/** Program challenges, edited on the program's page (plan phase 6). */
export const GET = adminRoute(
  {
    name: "GET /admin/programs/:id/challenges",
    params: adminIdParamsSchema,
    handler: ({ tx, params }) => programChallenges(tx, params.id),
  },
  adminDeps,
);

export const POST = adminRoute(
  {
    name: "POST /admin/programs/:id/challenges",
    params: adminIdParamsSchema,
    body: adminProgramChallengeCreateSchema,
    mutation: true,
    status: 201,
    handler: ({ tx, params, body, audit }) => createProgramChallenge(tx, params.id, body, audit),
  },
  adminDeps,
);
