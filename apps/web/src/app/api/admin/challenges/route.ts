import { adminWeeklyCreateSchema } from "@eyeq/api-contract";
import { adminRoute } from "@/server/api/admin";
import { adminDeps } from "@/server/api/deps";
import { createWeekly, weeklyChallenges } from "@/server/services/admin/challenges";

/** The weekly challenge editor (board 17, Game settings; plan phase 6). */
export const GET = adminRoute(
  { name: "GET /admin/challenges", handler: ({ tx }) => weeklyChallenges(tx) },
  adminDeps,
);

export const POST = adminRoute(
  {
    name: "POST /admin/challenges",
    body: adminWeeklyCreateSchema,
    mutation: true,
    status: 201,
    handler: ({ tx, body, audit }) => createWeekly(tx, body, audit),
  },
  adminDeps,
);
