import { z } from "zod";
import { measurementGroups, sessionDrillSchema } from "./content.ts";

/**
 * The daily loop (plan phase 5, section 7): GET /home, GET /drills/:id,
 * GET /drills/:id/media, POST /completions, GET /progress, POST /me/self-ratings,
 * POST /programs/:id/enroll, GET /me/entitlements.
 *
 * Every number a screen shows about rewards comes from these payloads (ground rule 1):
 * the client animates the completion result, never its own sums. Objects that carry a
 * drill are strict, so a video reference (rule 5) fails validation instead of passing.
 */
const timestamp = z.iso.datetime({ offset: true });
const date = z.iso.date();

export const levelProgressSchema = z.object({
  level: z.number().int(),
  title: z.string(),
  totalXp: z.number().int(),
  xpInLevel: z.number().int(),
  xpForLevel: z.number().int(),
  toNext: z.number().int(),
  nextThreshold: z.number().int(),
});
export type LevelProgress = z.infer<typeof levelProgressSchema>;

export const streakStates = ["done", "frozen", "ended", "at_risk", "pending"] as const;
export const streakDayStatuses = ["done", "frozen", "today", "future", "missed", "before"] as const;

export const streakStateSchema = z.object({
  current: z.number().int(),
  best: z.number().int(),
  state: z.enum(streakStates),
  freezesHeld: z.number().int(),
  freezeMax: z.number().int(),
  multiplier: z.number(),
  endsAt: timestamp,
  frozenDay: date.nullable(),
  lastRun: z.number().int(),
  lastTrained: date.nullable(),
  week: z.array(z.object({ date, status: z.enum(streakDayStatuses) })),
});
export type StreakState = z.infer<typeof streakStateSchema>;

/** A drill in Today's session list (the Home card), no video reference. */
export const todayDrillSchema = z.strictObject({
  drillId: z.uuid(),
  order: z.number().int(),
  title: z.string(),
  measurementTag: z.string().nullable(),
  measurementName: z.string().nullable().optional(),
  measurementGroup: z.enum(measurementGroups).nullable().optional(),
  durationMinutes: z.number().int(),
  xp: z.number().int(),
  access: z.enum(["included", "free_preview", "free_pool", "ppv"]),
  scoreType: z.enum(["none", "number", "rating"]),
  targetLabel: z.string().nullable(),
  locked: z.boolean(),
  done: z.boolean(),
});
export type TodayDrill = z.infer<typeof todayDrillSchema>;

const xpPreviewSchema = z.object({
  drills: z.number().int(),
  sessionBonus: z.number().int(),
  multiplier: z.number().int(),
  multiplierFactor: z.number().optional(),
  total: z.number().int(),
});

const locks = z.enum(["paywall", "module"]).nullable();

/** plan 6.3: the active program's session, else the day's free drill (D20), else nothing. */
export const todaySchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("program"),
    sessionId: z.uuid(),
    programId: z.uuid(),
    programSlug: z.string(),
    programTitle: z.string(),
    enrollmentId: z.uuid(),
    dayNumber: z.number().int(),
    durationDays: z.number().int(),
    moduleId: z.uuid(),
    moduleTitle: z.string(),
    moduleOrder: z.number().int(),
    title: z.string().nullable(),
    estMinutes: z.number().int(),
    drills: z.array(todayDrillSchema),
    completed: z.boolean(),
    locked: locks,
    xpPreview: xpPreviewSchema,
    localDate: date,
  }),
  z.strictObject({
    kind: z.literal("free"),
    drillId: z.uuid(),
    title: z.string(),
    estMinutes: z.number().int(),
    drills: z.array(todayDrillSchema),
    completed: z.boolean(),
    locked: locks,
    programLocked: locks,
    xpPreview: xpPreviewSchema,
    localDate: date,
  }),
  z.strictObject({
    kind: z.literal("none"),
    completed: z.boolean(),
    locked: locks,
    localDate: date,
  }),
]);
export type Today = z.infer<typeof todaySchema>;

export const challengeRowSchema = z.object({
  id: z.uuid(),
  type: z.enum(["weekly", "program", "paid"]),
  title: z.string(),
  description: z.string().nullable(),
  windowStart: timestamp,
  windowEnd: timestamp,
  programId: z.uuid().nullable(),
  reward: z.object({
    xp: z.number().int(),
    coins: z.number().int(),
    badgeId: z.uuid().nullable(),
    badge: z.string().nullable(),
  }),
  progress: z.number(),
  target: z.number(),
  completed: z.boolean(),
  completedAt: timestamp.nullable(),
  joined: z.number().int(),
  state: z.enum(["complete", "missed", "active"]),
  newlyCompleted: z.boolean().optional(),
  resetsAt: timestamp.optional(),
});
export type ChallengeRow = z.infer<typeof challengeRowSchema>;

export const weeklyRankSchema = z.object({
  scope: z.enum(["global", "sport", "age_band"]),
  scopeValue: z.string(),
  rank: z.number().int(),
  xp: z.number().int(),
  rankDayStart: z.number().int().nullable(),
  delta: z.number().int(),
  of: z.number().int(),
  weekStart: date,
});

export const homeResponseSchema = z.object({
  localDate: date,
  now: timestamp,
  timezone: z.string(),
  profile: z.object({
    id: z.uuid(),
    displayName: z.string(),
    sport: z.string().nullable(),
    initials: z.string(),
    visibility: z.enum(["public", "private"]),
  }),
  today: todaySchema,
  streak: streakStateSchema,
  level: levelProgressSchema,
  coins: z.number().int(),
  weeklyChallenge: challengeRowSchema.nullable(),
  weeklyRank: weeklyRankSchema.nullable(),
  program: z
    .object({
      enrollmentId: z.uuid(),
      programId: z.uuid(),
      slug: z.string(),
      title: z.string(),
      currentDay: z.number().int(),
      durationDays: z.number().int(),
      completed: z.boolean(),
    })
    .nullable(),
});
export type HomeResponse = z.infer<typeof homeResponseSchema>;

/** GET /drills/:id: one drill outside a session (the free drill of the day). */
export const drillDetailSchema = sessionDrillSchema.extend({
  /** It is today's free drill (D20): completing it counts as the day's session. */
  freeToday: z.boolean(),
});
export type DrillDetail = z.infer<typeof drillDetailSchema>;

export const drillIdParamsSchema = z.strictObject({ id: z.uuid() });
export const drillMediaQuerySchema = z.strictObject({ session: z.uuid().optional() });

/**
 * GET /drills/:id/media: the only response that carries a video reference, after the
 * entitlement check in get_drill_media (rule 5). `doneThreshold` is the watched share that
 * unlocks Mark done (game_config video.done_threshold).
 */
export const drillMediaSchema = z.strictObject({
  drillId: z.uuid(),
  provider: z.enum(["youtube", "drive", "mux"]),
  ref: z.string(),
  thumbnailUrl: z.string().nullable(),
  durationMinutes: z.number().int(),
  doneThreshold: z.number(),
});
export type DrillMedia = z.infer<typeof drillMediaSchema>;

/**
 * POST /completions: one event, or a batch for replay (mobile offline queue). Each event is
 * idempotent by its client_event_id (rule 6): a retry returns the stored result.
 */
export const completionEventSchema = z.strictObject({
  clientEventId: z.string().min(8).max(100),
  drillId: z.uuid(),
  sessionId: z.uuid().nullable(),
  completedAt: timestamp,
  score: z.number().min(0).max(100000).nullable(),
  watchPct: z.number().min(0).max(1),
});
export type CompletionEvent = z.infer<typeof completionEventSchema>;

export const completionsRequestSchema = z.strictObject({
  events: z.array(completionEventSchema).min(1).max(20),
});
export type CompletionsRequest = z.infer<typeof completionsRequestSchema>;

export const xpRowSchema = z.object({
  reason: z.enum([
    "drill",
    "session_bonus",
    "personal_best",
    "streak_multiplier",
    "challenge",
    "program_complete",
  ]),
  amount: z.number().int(),
  requested: z.number().int(),
  truncated: z.boolean(),
  drillId: z.uuid().optional(),
  repeat: z.boolean().optional(),
  streak: z.number().int().optional(),
  factor: z.number().optional(),
  previousBest: z.number().optional(),
  score: z.number().optional(),
  programId: z.uuid().optional(),
});
export type XpRow = z.infer<typeof xpRowSchema>;

export const badgeAwardSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  family: z.string(),
  coins: z.number().int(),
  icon: z.string().nullable(),
});
export type BadgeAward = z.infer<typeof badgeAwardSchema>;

/** The complete_drill result object (plan 6.8). The summary animates exactly this. */
export const completionResultSchema = z.object({
  completionId: z.uuid(),
  drillId: z.uuid(),
  sessionId: z.uuid().nullable(),
  localDate: date,
  late: z.boolean(),
  duplicate: z.boolean(),
  xp: z.array(xpRowSchema),
  xpEarned: z.number().int(),
  dailyTotal: z.number().int(),
  dailyCap: z.number().int(),
  level: levelProgressSchema.extend({
    before: z.number().int(),
    after: z.number().int(),
    titleBefore: z.string(),
    leveledUp: z.boolean(),
  }),
  streak: z.object({
    before: z.number().int(),
    after: z.number().int(),
    current: z.number().int(),
    best: z.number().int(),
    freezesHeld: z.number().int(),
    multiplier: z.number(),
    extended: z.boolean(),
  }),
  session: z.object({
    kind: z.enum(["program", "free", "adhoc"]),
    complete: z.boolean(),
    drillsDone: z.number().int(),
    drillsTotal: z.number().int(),
    bonusAwarded: z.boolean(),
  }),
  challenges: z.array(challengeRowSchema),
  badges: z.array(badgeAwardSchema),
  coinsEarned: z.number().int(),
  coinsBalance: z.number().int(),
  program: z
    .object({
      enrollmentId: z.uuid(),
      programId: z.uuid(),
      title: z.string(),
      currentDay: z.number().int(),
      durationDays: z.number().int(),
      completed: z.boolean(),
      justCompleted: z.boolean(),
    })
    .nullable(),
  rank: z
    .object({
      weekStart: date,
      rank: z.number().int(),
      xp: z.number().int(),
      rankDayStart: z.number().int().nullable(),
    })
    .nullable(),
});
export type CompletionResult = z.infer<typeof completionResultSchema>;

/** One entry per event, in order: the result, or why that event was refused. */
export const completionsResponseSchema = z.object({
  results: z.array(
    z.union([
      z.object({ clientEventId: z.string(), ok: z.literal(true), result: completionResultSchema }),
      z.object({
        clientEventId: z.string(),
        ok: z.literal(false),
        error: z.object({ code: z.string(), message: z.string() }),
      }),
    ]),
  ),
});
export type CompletionsResponse = z.infer<typeof completionsResponseSchema>;

export const ratingAreas = ["focus", "reaction", "tracking"] as const;
export const ratingKinds = ["baseline", "day14", "day21", "adhoc"] as const;

/** POST /me/self-ratings: the three areas rated 1 to 5 together. */
export const selfRatingsRequestSchema = z.strictObject({
  kind: z.enum(ratingKinds),
  ratings: z.strictObject({
    focus: z.number().int().min(1).max(5),
    reaction: z.number().int().min(1).max(5),
    tracking: z.number().int().min(1).max(5),
  }),
});
export type SelfRatingsRequest = z.infer<typeof selfRatingsRequestSchema>;

const ratingsMap = z
  .object({
    focus: z.number().int().optional(),
    reaction: z.number().int().optional(),
    tracking: z.number().int().optional(),
  })
  .nullable();

export const progressResponseSchema = z.object({
  localDate: date,
  streak: z.object({ current: z.number().int(), best: z.number().int() }),
  sessionsTotal: z.number().int(),
  minutesTotal: z.number().int(),
  weeklyTarget: z.number().int(),
  weeks: z.array(
    z.object({ weekStart: date, sessions: z.number().int(), minutes: z.number().int() }),
  ),
  calendar: z.array(z.object({ date, status: z.enum(streakDayStatuses) })),
  drills: z.array(
    z.object({
      drillId: z.uuid(),
      title: z.string(),
      unit: z.string().nullable(),
      direction: z.enum(["higher", "lower"]),
      best: z.number().nullable(),
      points: z.array(z.object({ date, score: z.number() })),
    }),
  ),
  ratings: z.object({
    baseline: ratingsMap,
    latest: ratingsMap,
    due: z.enum(["day14", "day21"]).nullable(),
    day: z.number().int(),
  }),
});
export type ProgressResponse = z.infer<typeof progressResponseSchema>;

export const programIdParamsSchema = z.strictObject({ id: z.uuid() });

export const enrollResponseSchema = z.object({
  enrollmentId: z.uuid(),
  programId: z.uuid(),
  currentDay: z.number().int(),
  startedAt: timestamp,
  completedAt: timestamp.nullable(),
});
export type EnrollResponse = z.infer<typeof enrollResponseSchema>;

export const entitlementSchema = z.object({
  id: z.uuid(),
  scope: z.enum(["subscription", "program", "drill", "challenge"]),
  scopeId: z.uuid().nullable(),
  source: z.enum(["play", "appstore", "razorpay", "coins", "credits", "admin"]),
  status: z.enum(["active", "grace", "ended"]),
  startsAt: timestamp,
  endsAt: timestamp.nullable(),
  title: z.string().nullable().optional(),
});
export const entitlementsResponseSchema = z.object({ entitlements: z.array(entitlementSchema) });
export type EntitlementsResponse = z.infer<typeof entitlementsResponseSchema>;
