import { after } from "next/server";
import { completionsRequestSchema } from "@eyeq/api-contract";
import { appDeps } from "@/server/api/deps";
import { apiRoute } from "@/server/api/pipeline";
import { completionEvents } from "@/server/services/analytics";
import { postCompletions } from "@/server/services/daily";

/**
 * POST /completions wraps complete_drill (plan 6.8). Each event is idempotent by its
 * client_event_id (rule 6), so the route needs no Idempotency-Key: a retry, or a replayed
 * offline batch, returns the stored results and emits no second analytics event.
 */
export const POST = apiRoute(
  {
    name: "POST /completions",
    body: completionsRequestSchema,
    rateLimits: ["api_user", "completions"],
    handler: ({ tx, body }) => postCompletions(tx, body.events),
    afterCommit: (res, session) => after(() => completionEvents(session.userId, res)),
  },
  appDeps,
);
