import type { Prisma, Tx } from "@eyeq/db";
import type {
  AdminChallenge,
  AdminChallengeUpdate,
  AdminProgramChallengeCreate,
  AdminProgramChallengesResponse,
  AdminWeeklyCreate,
  AdminWeeklyResponse,
  ChallengeGoal,
} from "@eyeq/api-contract";
import { ApiError } from "../../api/errors";
import type { AuditEntry } from "../../api/admin";

/**
 * The challenge editor (plan phase 6, 6.7). Weekly challenges run Monday 00:00 IST to the
 * next Monday; one is live at a time, and if none is scheduled for next week the live one
 * repeats (week_rollover). Program challenges run between two IST dates for athletes
 * enrolled in the program. Every change is audited in the same transaction (plan 7).
 */
type Row = Prisma.challengesGetPayload<object>;
type Audit = (e: AuditEntry) => Promise<void>;

/** The goal as the engine reads it (snake_case jsonb, like a badge rule). */
function goalToDb(g: ChallengeGoal): Prisma.InputJsonObject {
  switch (g.metric) {
    case "sessions_total":
      return { metric: g.metric, gte: g.gte };
    case "module_sessions":
      return { metric: g.metric, module_id: g.moduleId };
    case "score_gte":
      return { metric: g.metric, drill_id: g.drillId, gte: g.gte };
  }
}

function goalFromDb(v: Prisma.JsonValue): ChallengeGoal {
  const o = (v ?? {}) as Record<string, unknown>;
  if (o["metric"] === "module_sessions")
    return { metric: "module_sessions", moduleId: String(o["module_id"]) };
  if (o["metric"] === "score_gte")
    return { metric: "score_gte", drillId: String(o["drill_id"]), gte: Number(o["gte"]) };
  return { metric: "sessions_total", gte: Number(o["gte"] ?? 1) };
}

async function nowFrom(tx: Tx): Promise<Date> {
  const [r] = await tx.$queryRaw<{ now: Date }[]>`select now() as now`;
  return r!.now;
}

function toAdmin(c: Row, now: Date, joined: number): AdminChallenge {
  return {
    id: c.id,
    type: c.type as AdminChallenge["type"],
    title: c.title,
    description: c.description,
    goal: goalFromDb(c.goal),
    windowStart: c.window_start.toISOString(),
    windowEnd: c.window_end.toISOString(),
    programId: c.program_id,
    rewardXp: c.reward_xp,
    rewardCoins: c.reward_coins,
    badgeId: c.badge_id,
    state: c.window_start > now ? "scheduled" : c.window_end <= now ? "ended" : "live",
    joined,
  };
}

async function shaped(tx: Tx, rows: Row[]): Promise<AdminChallenge[]> {
  const now = await nowFrom(tx);
  const counts = await tx.challenge_progress.groupBy({
    by: ["challenge_id"],
    where: { challenge_id: { in: rows.map((r) => r.id) }, progress: { gt: 0 } },
    _count: { _all: true },
  });
  const joined = new Map(counts.map((c) => [c.challenge_id, c._count._all]));
  return rows.map((r) => toAdmin(r, now, joined.get(r.id) ?? 0));
}

async function badgeOptions(tx: Tx) {
  return tx.badges.findMany({
    where: { active: true },
    select: { id: true, name: true },
    orderBy: [{ sort: "asc" }, { name: "asc" }],
  });
}

/** Monday 00:00 IST of this week, next week and the one after, as instants and dates. */
async function weeks(tx: Tx) {
  const [w] = await tx.$queryRaw<
    { this_start: Date; next_start: Date; after_next: Date; this_date: Date; next_date: Date }[]
  >`
    select local_day_start(ist_week_start(now()), 'Asia/Kolkata') as this_start,
           local_day_start(ist_week_start(now()) + 7, 'Asia/Kolkata') as next_start,
           local_day_start(ist_week_start(now()) + 14, 'Asia/Kolkata') as after_next,
           ist_week_start(now()) as this_date, ist_week_start(now()) + 7 as next_date`;
  return w!;
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** GET /admin/challenges. */
export async function weeklyChallenges(tx: Tx): Promise<AdminWeeklyResponse> {
  const w = await weeks(tx);
  const rows = await tx.challenges.findMany({
    where: {
      type: "weekly",
      window_start: { gte: new Date(w.this_start.getTime() - 56 * 86400e3) },
    },
    orderBy: { window_start: "desc" },
  });
  const all = await shaped(tx, rows);
  return {
    live: all.find((c) => c.state === "live") ?? null,
    next: all.find((c) => c.windowStart === w.next_start.toISOString()) ?? null,
    weekStart: isoDate(w.this_date),
    nextWeekStart: isoDate(w.next_date),
    recent: all.filter((c) => c.state === "ended").slice(0, 6),
    badges: await badgeOptions(tx),
  };
}

/** POST /admin/challenges: this week's (only when none is live) or next week's. */
export async function createWeekly(
  tx: Tx,
  body: AdminWeeklyCreate,
  audit: Audit,
): Promise<AdminChallenge> {
  const w = await weeks(tx);
  const [start, end] =
    body.week === "current" ? [w.this_start, w.next_start] : [w.next_start, w.after_next];
  const clash = await tx.challenges.findFirst({
    where: { type: "weekly", window_start: { lt: end }, window_end: { gt: start } },
  });
  if (clash)
    throw new ApiError(409, "conflict", "That week already has a weekly challenge.", {
      reason: "week_taken",
      challengeId: clash.id,
    });
  const row = await tx.challenges.create({
    data: {
      type: "weekly",
      title: body.title,
      description: body.description ?? null,
      goal: goalToDb({ metric: "sessions_total", gte: body.target }),
      window_start: start,
      window_end: end,
      reward_xp: body.rewardXp,
      reward_coins: body.rewardCoins,
      badge_id: body.badgeId,
    },
  });
  const [after] = await shaped(tx, [row]);
  await audit({ action: "challenge.create", targetType: "challenge", targetId: row.id, after });
  return after!;
}

/** The module or drill a program challenge names must belong to that program. */
async function checkGoalInProgram(tx: Tx, programId: string, goal: ChallengeGoal) {
  if (goal.metric === "module_sessions") {
    const m = await tx.modules.findFirst({ where: { id: goal.moduleId, program_id: programId } });
    if (!m) throw new ApiError(400, "validation_failed", "That module is not in this program.");
  } else if (goal.metric === "score_gte") {
    const d = await tx.session_drills.findFirst({
      where: { drill_id: goal.drillId, sessions: { program_id: programId } },
    });
    if (!d) throw new ApiError(400, "validation_failed", "That drill is not in this program.");
  }
}

async function dayStart(tx: Tx, isoDay: string, plusDays = 0): Promise<Date> {
  const [r] = await tx.$queryRaw<{ t: Date }[]>`
    select local_day_start(${isoDay}::date + ${plusDays}::integer, 'Asia/Kolkata') as t`;
  return r!.t;
}

/** PATCH /admin/challenges/:id: a live or scheduled challenge; a closed one is history. */
export async function updateChallenge(
  tx: Tx,
  id: string,
  body: AdminChallengeUpdate,
  audit: Audit,
): Promise<AdminChallenge> {
  const row = await tx.challenges.findUnique({ where: { id } });
  if (!row || (row.type !== "weekly" && row.type !== "program"))
    throw new ApiError(404, "not_found", "Not found.");
  const [before] = await shaped(tx, [row]);
  if (before!.state === "ended")
    throw new ApiError(409, "conflict", "A closed challenge cannot change.", { reason: "ended" });
  if (row.type === "weekly" && body.goal && body.goal.metric !== "sessions_total")
    throw new ApiError(400, "validation_failed", "A weekly challenge counts sessions.");
  if (row.type === "weekly" && body.endDate)
    throw new ApiError(400, "validation_failed", "A weekly challenge runs for its week.");
  if (row.type === "program" && body.goal) await checkGoalInProgram(tx, row.program_id!, body.goal);
  let windowEnd: Date | undefined;
  if (body.endDate) {
    windowEnd = await dayStart(tx, body.endDate, 1);
    if (windowEnd <= row.window_start)
      throw new ApiError(400, "validation_failed", "It cannot end before it starts.");
  }
  const updated = await tx.challenges.update({
    where: { id },
    data: {
      ...(body.title !== undefined && { title: body.title }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.goal && { goal: goalToDb(body.goal) }),
      ...(body.rewardXp !== undefined && { reward_xp: body.rewardXp }),
      ...(body.rewardCoins !== undefined && { reward_coins: body.rewardCoins }),
      ...(body.badgeId !== undefined && { badge_id: body.badgeId }),
      ...(windowEnd && { window_end: windowEnd }),
    },
  });
  const [after] = await shaped(tx, [updated]);
  await audit({ action: "challenge.update", targetType: "challenge", targetId: id, before, after });
  return after!;
}

/** DELETE /admin/challenges/:id: only one that has not started (nobody has progress on it). */
export async function deleteChallenge(tx: Tx, id: string, audit: Audit): Promise<{ ok: true }> {
  const row = await tx.challenges.findUnique({ where: { id } });
  if (!row || (row.type !== "weekly" && row.type !== "program"))
    throw new ApiError(404, "not_found", "Not found.");
  const [before] = await shaped(tx, [row]);
  if (before!.state !== "scheduled")
    throw new ApiError(409, "conflict", "Only a challenge that has not started can be removed.", {
      reason: before!.state,
    });
  await tx.challenges.delete({ where: { id } });
  await audit({ action: "challenge.delete", targetType: "challenge", targetId: id, before });
  return { ok: true };
}

/** GET /admin/programs/:id/challenges. */
export async function programChallenges(
  tx: Tx,
  programId: string,
): Promise<AdminProgramChallengesResponse> {
  const rows = await tx.challenges.findMany({
    where: { type: "program", program_id: programId },
    orderBy: [{ window_start: "desc" }, { title: "asc" }],
  });
  return { challenges: await shaped(tx, rows), badges: await badgeOptions(tx) };
}

/** POST /admin/programs/:id/challenges. */
export async function createProgramChallenge(
  tx: Tx,
  programId: string,
  body: AdminProgramChallengeCreate,
  audit: Audit,
): Promise<AdminChallenge> {
  const p = await tx.programs.findUnique({ where: { id: programId }, select: { id: true } });
  if (!p) throw new ApiError(404, "not_found", "Not found.");
  await checkGoalInProgram(tx, programId, body.goal);
  const row = await tx.challenges.create({
    data: {
      type: "program",
      program_id: programId,
      title: body.title,
      description: body.description ?? null,
      goal: goalToDb(body.goal),
      window_start: await dayStart(tx, body.startDate),
      window_end: await dayStart(tx, body.endDate, 1),
      reward_xp: body.rewardXp,
      reward_coins: body.rewardCoins,
      badge_id: body.badgeId,
    },
  });
  const [after] = await shaped(tx, [row]);
  await audit({ action: "challenge.create", targetType: "challenge", targetId: row.id, after });
  return after!;
}
