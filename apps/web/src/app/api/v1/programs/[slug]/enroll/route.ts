import { z } from "zod";
import { appDeps } from "@/server/api/deps";
import { apiRoute } from "@/server/api/pipeline";
import { enroll } from "@/server/services/daily";

/**
 * POST /programs/:id/enroll. The folder is [slug] because Next.js allows one dynamic
 * segment name per level and GET /programs/:slug owns it; here the segment is the id.
 */
export const POST = apiRoute(
  {
    name: "POST /programs/:id/enroll",
    params: z.strictObject({ slug: z.uuid() }),
    idempotent: true,
    handler: ({ tx, params }) => enroll(tx, params.slug),
  },
  appDeps,
);
