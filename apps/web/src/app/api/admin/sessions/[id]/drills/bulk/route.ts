import { builderIdParamsSchema, bulkPasteSchema } from "@eyeq/api-contract";
import { adminRoute } from "@/server/api/admin";
import { adminDeps } from "@/server/api/deps";
import { bulkPaste } from "@/server/services/admin/builder";
import { linkChecker } from "@/server/services/admin/link-check";

export const POST = adminRoute(
  {
    name: "POST /admin/sessions/:id/drills/bulk",
    params: builderIdParamsSchema,
    body: bulkPasteSchema,
    mutation: true,
    status: 201,
    handler: ({ tx, params, body, audit }) =>
      bulkPaste(tx, linkChecker(), params.id, body.links, audit),
  },
  adminDeps,
);
