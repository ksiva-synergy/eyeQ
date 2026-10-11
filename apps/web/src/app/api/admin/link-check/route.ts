import { linkCheckRequestSchema } from "@eyeq/api-contract";
import { adminRoute } from "@/server/api/admin";
import { adminDeps } from "@/server/api/deps";
import { checkLink } from "@/server/services/admin/builder";
import { linkChecker } from "@/server/services/admin/link-check";

// Checks a link without saving anything (the editor's "Check" button), so no audit row.
export const POST = adminRoute(
  {
    name: "POST /admin/link-check",
    body: linkCheckRequestSchema,
    handler: ({ body }) => checkLink(linkChecker(), body.url),
  },
  adminDeps,
);
