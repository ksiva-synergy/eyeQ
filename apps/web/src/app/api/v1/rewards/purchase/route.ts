import { rewardPurchaseRequestSchema } from "@eyeq/api-contract";
import { appDeps } from "@/server/api/deps";
import { apiRoute } from "@/server/api/pipeline";
import { purchaseReward } from "@/server/services/compete";

/** POST /rewards/purchase: a streak freeze or a drill unlock with coins (plan 6.5, P0). */
export const POST = apiRoute(
  {
    name: "POST /rewards/purchase",
    body: rewardPurchaseRequestSchema,
    idempotent: true,
    handler: ({ tx, body }) => purchaseReward(tx, body),
  },
  appDeps,
);
