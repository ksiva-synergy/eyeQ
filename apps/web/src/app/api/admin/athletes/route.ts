import { adminRoute } from "@/server/api/admin";
import { adminDeps } from "@/server/api/deps";
import { listAthletes, readAthletesQuery } from "@/server/services/admin/athletes";

export const GET = adminRoute(
  {
    name: "GET /admin/athletes",
    handler: ({ tx, req }) => listAthletes(tx, readAthletesQuery(req)),
  },
  adminDeps,
);
