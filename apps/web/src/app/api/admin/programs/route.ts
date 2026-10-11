import { programCreateSchema } from "@eyeq/api-contract";
import { adminRoute } from "@/server/api/admin";
import { adminDeps } from "@/server/api/deps";
import { createProgram, listPrograms } from "@/server/services/admin/builder";

export const GET = adminRoute(
  { name: "GET /admin/programs", handler: ({ tx }) => listPrograms(tx) },
  adminDeps,
);

export const POST = adminRoute(
  {
    name: "POST /admin/programs",
    body: programCreateSchema,
    mutation: true,
    status: 201,
    handler: ({ tx, body, audit }) => createProgram(tx, body, audit),
  },
  adminDeps,
);
