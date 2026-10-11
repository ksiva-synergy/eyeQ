import { appDeps } from "@/server/api/deps";
import { apiRoute } from "@/server/api/pipeline";
import { env } from "@/server/env";

/**
 * GET /me/push-config: the VAPID public key a browser subscribes with. Public by design,
 * served from here rather than a NEXT_PUBLIC_* variable (rule 12 keeps those for nothing).
 */
export const GET = apiRoute(
  {
    name: "GET /me/push-config",
    handler: async () => ({ vapidPublicKey: env.vapid()?.publicKey ?? null }),
  },
  appDeps,
);
