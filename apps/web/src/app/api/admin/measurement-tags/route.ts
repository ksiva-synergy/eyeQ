import { adminRoute } from "@/server/api/admin";
import { adminDeps } from "@/server/api/deps";
import { listMeasurementTags } from "@/server/services/admin/builder";

export const GET = adminRoute(
  { name: "GET /admin/measurement-tags", handler: ({ tx }) => listMeasurementTags(tx) },
  adminDeps,
);
