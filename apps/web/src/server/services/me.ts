import type { Tx } from "@eyeq/db";
import type { MeResponse, PatchMeRequest } from "@eyeq/api-contract";
import type { Session } from "../auth/session";
import { ApiError } from "../api/errors";

/** Prisma maps `time` to a Date on 1970-01-01 UTC. */
function hhmm(d: Date): string {
  return d.toISOString().slice(11, 16);
}

/**
 * The athlete's own profile. Every read here runs as eyeq_api inside the request
 * transaction, so RLS limits it to app.user_id even if a filter were wrong.
 */
export async function getMe(tx: Tx, session: Session): Promise<MeResponse> {
  const p = await tx.profiles.findUnique({
    where: { id: session.userId },
    include: { user_stats: true, admins: true },
  });
  if (!p) throw new ApiError(404, "not_found", "Profile not found.");
  const [minor] = await tx.$queryRaw<{ v: boolean }[]>`select is_minor(${p.dob}::date) as v`;
  const s = p.user_stats;
  return {
    id: p.id,
    displayName: p.display_name,
    phone: session.phone,
    email: session.email,
    sport: p.sport,
    playingLevel: p.playing_level as MeResponse["playingLevel"],
    goal: p.goal,
    hasDob: p.dob !== null,
    isMinor: minor?.v ?? false,
    sessionMinutes: p.session_minutes,
    timezone: p.timezone,
    visibility: p.visibility as MeResponse["visibility"],
    reminderTime: hhmm(p.reminder_time),
    notifications: {
      daily: p.notify_daily,
      streak: p.notify_streak,
      challenge: p.notify_challenge,
      recap: p.notify_recap,
      overtaken: p.notify_overtaken,
    },
    onboardedAt: p.onboarded_at?.toISOString() ?? null,
    isAdmin: p.admins !== null,
    stats: {
      totalXp: s?.total_xp ?? 0,
      level: s?.level ?? 1,
      currentStreak: s?.current_streak ?? 0,
      bestStreak: s?.best_streak ?? 0,
      coins: s?.coins ?? 0,
      freezesHeld: s?.freezes_held ?? 0,
    },
  };
}

export async function patchMe(
  tx: Tx,
  session: Session,
  input: PatchMeRequest,
): Promise<MeResponse> {
  const n = input.notifications ?? {};
  await tx.profiles.update({
    where: { id: session.userId },
    data: {
      ...(input.displayName !== undefined && { display_name: input.displayName }),
      ...(input.sport !== undefined && { sport: input.sport }),
      ...(input.playingLevel !== undefined && { playing_level: input.playingLevel }),
      ...(input.dob !== undefined && {
        dob: input.dob === null ? null : new Date(`${input.dob}T00:00:00Z`),
      }),
      ...(input.goal !== undefined && { goal: input.goal }),
      ...(input.sessionMinutes !== undefined && { session_minutes: input.sessionMinutes }),
      ...(input.timezone !== undefined && { timezone: input.timezone }),
      ...(input.visibility !== undefined && { visibility: input.visibility }),
      ...(input.reminderTime !== undefined && {
        reminder_time: new Date(`1970-01-01T${input.reminderTime}:00Z`),
      }),
      ...(n.daily !== undefined && { notify_daily: n.daily }),
      ...(n.streak !== undefined && { notify_streak: n.streak }),
      ...(n.challenge !== undefined && { notify_challenge: n.challenge }),
      ...(n.recap !== undefined && { notify_recap: n.recap }),
      ...(n.overtaken !== undefined && { notify_overtaken: n.overtaken }),
    },
  });
  if (input.onboarded) {
    await tx.$executeRaw`update profiles set onboarded_at = coalesce(onboarded_at, now()) where id = ${session.userId}::uuid`;
  }
  return getMe(tx, session);
}
