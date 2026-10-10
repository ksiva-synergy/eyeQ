import { adminAthleteParamsSchema } from "@eyeq/api-contract";
import { adminRoute } from "@/server/api/admin";
import { adminDeps } from "@/server/api/deps";
import { getAthlete } from "@/server/services/admin/athletes";

export const GET = adminRoute(
  {
    name: "GET /admin/athletes/:id",
    params: adminAthleteParamsSchema,
    handler: ({ tx, params }) => getAthlete(tx, params.id),
  },
  adminDeps,
);
