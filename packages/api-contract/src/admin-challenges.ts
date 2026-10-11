import { z } from "zod";

/**
 * /api/admin challenges (plan phase 6, 6.7, board 17): the weekly challenge editor in Game
 * settings (the live one, and next week's, which otherwise repeats the live one) and the
 * program challenges on a program's page. Goals use the badge rule shape the engine
 * evaluates; the editor offers the three the boards draw.
 */
const timestamp = z.iso.datetime({ offset: true });
const date = z.iso.date();
const title = z.string().trim().min(1).max(80);
const description = z.string().trim().max(240).nullable();
const rewardXp = z.number().int().min(0).max(1000);
const rewardCoins = z.number().int().min(0).max(1000);

export const challengeGoalSchema = z.discriminatedUnion("metric", [
  /** Complete N sessions in the window (the weekly challenge). */
  z.strictObject({ metric: z.literal("sessions_total"), gte: z.number().int().min(1).max(100) }),
  /** Complete every session of a module in the window ("Finish Module 2 by Sunday"). */
  z.strictObject({ metric: z.literal("module_sessions"), moduleId: z.uuid() }),
  /** Log a score at or above N on a drill ("Score 25+ clean shifts on Near–Far"). */
  z.strictObject({
    metric: z.literal("score_gte"),
    drillId: z.uuid(),
    gte: z.number().min(0).max(100000),
  }),
]);
export type ChallengeGoal = z.infer<typeof challengeGoalSchema>;

export const adminChallengeSchema = z.strictObject({
  id: z.uuid(),
  type: z.enum(["weekly", "program"]),
  title: z.string(),
  description: z.string().nullable(),
  goal: challengeGoalSchema,
  windowStart: timestamp,
  windowEnd: timestamp,
  programId: z.uuid().nullable(),
  rewardXp: z.number().int(),
  rewardCoins: z.number().int(),
  badgeId: z.uuid().nullable(),
  /** live: running now; scheduled: not started; ended: closed. */
  state: z.enum(["live", "scheduled", "ended"]),
  /** Athletes with progress on it. */
  joined: z.number().int(),
});
export type AdminChallenge = z.infer<typeof adminChallengeSchema>;

export const adminBadgeOptionSchema = z.strictObject({ id: z.uuid(), name: z.string() });

/** GET /admin/challenges: the weekly challenge, this week and next. */
export const adminWeeklyResponseSchema = z.strictObject({
  live: adminChallengeSchema.nullable(),
  next: adminChallengeSchema.nullable(),
  /** Monday 00:00 IST of this week and of next (the windows a weekly challenge takes). */
  weekStart: date,
  nextWeekStart: date,
  recent: z.array(adminChallengeSchema),
  badges: z.array(adminBadgeOptionSchema),
});
export type AdminWeeklyResponse = z.infer<typeof adminWeeklyResponseSchema>;

/** POST /admin/challenges: a weekly challenge for this week (when none is live) or next. */
export const adminWeeklyCreateSchema = z.strictObject({
  week: z.enum(["current", "next"]),
  title,
  description: description.optional(),
  target: z.number().int().min(1).max(100),
  rewardXp,
  rewardCoins,
  badgeId: z.uuid().nullable(),
});
export type AdminWeeklyCreate = z.infer<typeof adminWeeklyCreateSchema>;

/** PATCH /admin/challenges/:id. The window of a weekly challenge is its week and stays. */
export const adminChallengeUpdateSchema = z
  .strictObject({
    title,
    description,
    goal: challengeGoalSchema,
    rewardXp,
    rewardCoins,
    badgeId: z.uuid().nullable(),
    /** Program challenges only: the last day (IST) the challenge runs. */
    endDate: date,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "nothing to change");
export type AdminChallengeUpdate = z.infer<typeof adminChallengeUpdateSchema>;

/** GET /admin/programs/:id/challenges. */
export const adminProgramChallengesResponseSchema = z.strictObject({
  challenges: z.array(adminChallengeSchema),
  badges: z.array(adminBadgeOptionSchema),
});
export type AdminProgramChallengesResponse = z.infer<typeof adminProgramChallengesResponseSchema>;

/** POST /admin/programs/:id/challenges: from the first to the last day (IST), inclusive. */
export const adminProgramChallengeCreateSchema = z
  .strictObject({
    title,
    description: description.optional(),
    goal: challengeGoalSchema,
    startDate: date,
    endDate: date,
    rewardXp,
    rewardCoins,
    badgeId: z.uuid().nullable(),
  })
  .refine((v) => v.endDate >= v.startDate, { message: "ends before it starts", path: ["endDate"] });
export type AdminProgramChallengeCreate = z.infer<typeof adminProgramChallengeCreateSchema>;
