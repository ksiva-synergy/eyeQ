import "server-only";
import { redirect } from "next/navigation";
import { asAthlete, type Tx } from "@eyeq/db";
import { currentSession } from "./auth/current";
import type { Session } from "./auth/session";
import { apiDb } from "./db";

/**
 * Server components of the athlete app read through the same services as /api/v1, in one
 * transaction as eyeq_api with app.user_id set (plan 7: "server components call the same
 * services directly"). Signed out, the page sends the athlete to sign-in and back.
 */
export async function asSignedInAthlete<T>(
  path: string,
  fn: (tx: Tx, session: Session) => Promise<T>,
): Promise<T> {
  const session = await currentSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(path)}`);
  return asAthlete(apiDb(), session.userId, async (tx) => {
    await tx.$queryRaw`select ensure_my_profile(${session.name})`;
    return fn(tx, session);
  });
}

/** Rule values for display copy (ground rule 8): read from game_config, never written in. */
export async function configNumbers<K extends string>(
  tx: Tx,
  keys: readonly K[],
): Promise<Record<K, number>> {
  const rows = await tx.$queryRaw<{ k: K; v: string | null }[]>`
    select k, config_num(k)::text as v from unnest(${keys as unknown as string[]}::text[]) k`;
  return Object.fromEntries(rows.map((r) => [r.k, Number(r.v ?? 0)])) as Record<K, number>;
}
