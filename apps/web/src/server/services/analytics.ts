import "server-only";
import type { CompletionsResponse } from "@eyeq/api-contract";
import { capture } from "../observability/posthog";

/**
 * Server-side analytics for the completion route (plan phase 5): drill_completed,
 * session_completed and streak_extended. Called after the transaction commits, never for a
 * stored replay (complete_drill returns duplicate: true). The distinct id is the user id;
 * properties are about the training, never about the person (ground rule 11).
 */
export async function completionEvents(userId: string, res: CompletionsResponse): Promise<void> {
  const sends: Promise<void>[] = [];
  for (const r of res.results) {
    if (!r.ok || r.result.duplicate) continue;
    const x = r.result;
    sends.push(
      capture(userId, "drill_completed", {
        drill_id: x.drillId,
        session_kind: x.session.kind,
        xp: x.xpEarned,
        late: x.late,
      }),
    );
    if (x.session.complete) {
      sends.push(
        capture(userId, "session_completed", {
          session_kind: x.session.kind,
          drills: x.session.drillsTotal,
          xp_day_total: x.dailyTotal,
        }),
      );
    }
    if (x.streak.extended) {
      sends.push(capture(userId, "streak_extended", { streak: x.streak.after }));
    }
  }
  await Promise.all(sends);
}
