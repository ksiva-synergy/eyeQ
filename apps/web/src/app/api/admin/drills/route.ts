import { adminRoute } from "@/server/api/admin";
import { adminDeps } from "@/server/api/deps";
import { listDrills } from "@/server/services/admin/builder";

export const GET = adminRoute(
  {
    name: "GET /admin/drills",
    handler: ({ tx, req }) =>
      listDrills(tx, new URL(req.url).searchParams.get("search")?.trim().slice(0, 80) || null),
  },
  adminDeps,
);
