import { adminRoute } from "@/server/api/admin";
import { adminDeps } from "@/server/api/deps";
import { exportAthletesCsv, readAthletesQuery } from "@/server/services/admin/athletes";

export const GET = adminRoute(
  {
    name: "GET /admin/athletes/export",
    csv: { filename: "eyeq-athletes.csv" },
    handler: ({ tx, req, audit }) => exportAthletesCsv(tx, readAthletesQuery(req), audit),
  },
  adminDeps,
);
