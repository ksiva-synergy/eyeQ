import { landingCoachUpdateSchema } from "@eyeq/api-contract";
import { adminRoute } from "@/server/api/admin";
import { adminDeps } from "@/server/api/deps";
import { getCoach, setCoach } from "@/server/services/landing";

/** The coach block on every public program page (board 15; game_config `landing.coach`). */
export const GET = adminRoute(
  { name: "GET /admin/landing-coach", handler: ({ tx }) => getCoach(tx) },
  adminDeps,
);

export const PATCH = adminRoute(
  {
    name: "PATCH /admin/landing-coach",
    body: landingCoachUpdateSchema,
    mutation: true,
    handler: ({ tx, body, audit }) => setCoach(tx, body, audit),
  },
  adminDeps,
);
