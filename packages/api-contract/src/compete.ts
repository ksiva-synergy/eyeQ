import { z } from "zod";
import { badgeAwardSchema, challengeRowSchema } from "./daily.ts";

/**
 * Compete and rewards (plan section 7, phase 6): leaderboards, challenges, badges and the
 * trophy case, rewards and coin spends. Every number is the server's (rule 1).
 */
const timestamp = z.iso.datetime({ offset: true });
const date = z.iso.date();

// ---------------------------------------------------------------- leaderboards (plan 6.6)

export const boardPeriods = ["week", "all"] as const;
export const boardScopes = ["global", "sport"] as const;

export const leaderboardQuerySchema = z.strictObject({
  period: z.enum(boardPeriods).default("week"),
  scope: z.enum(boardScopes).default("global"),
});
export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;

/**
 * A public board row: display name, initials, XP level, XP and rank (rule 11, D25), plus
 * the movement since the start of the day. Sport appears only on the sport board, where
 * it is the board's own sport. No user id, no other personal data.
 */
export const boardRowSchema = z.strictObject({
  rank: z.number().int(),
  displayName: z.string(),
  initials: z.string(),
  level: z.number().int(),
  xp: z.number().int(),
  /** Places gained since 00:00 IST (positive is up); null on the all-time board. */
  delta: z.number().int().nullable(),
  isMe: z.boolean(),
});
export type BoardRow = z.infer<typeof boardRowSchema>;

/** The athlete's own row, pinned. Always present for an athlete with XP, public or not. */
export const boardMeSchema = z.strictObject({
  rank: z.number().int(),
  xp: z.number().int(),
  delta: z.number().int().nullable(),
  isPublic: z.boolean(),
  displayName: z.string(),
  initials: z.string(),
  level: z.number().int(),
  sport: z.string().nullable(),
  /**
   * The public athlete one place above and the XP needed to pass them; null at the top.
   * A display name only, which public boards show anyway (rule 11).
   */
  gapAbove: z
    .strictObject({ xp: z.number().int(), rank: z.number().int(), displayName: z.string() })
    .nullable(),
  /** The public athlete one place below and the XP lead over them: the rank-change moment. */
  gapBelow: z
    .strictObject({ xp: z.number().int(), rank: z.number().int(), displayName: z.string() })
    .nullable(),
});
export type BoardMe = z.infer<typeof boardMeSchema>;

export const leaderboardResponseSchema = z.strictObject({
  period: z.enum(boardPeriods),
  scope: z.enum(boardScopes),
  /** The sport of the sport board ("cricket"); "" on the global board. */
  scopeValue: z.string(),
  weekStart: date.nullable(),
  /** Monday 00:00 IST, when the weekly board resets. */
  resetsAt: timestamp,
  /** Public athletes on this board. */
  count: z.number().int(),
  rows: z.array(boardRowSchema),
  me: boardMeSchema.nullable(),
});
export type LeaderboardResponse = z.infer<typeof leaderboardResponseSchema>;

// ---------------------------------------------------------------- challenges (plan 6.7)

export const challengesResponseSchema = z.strictObject({
  active: z.array(challengeRowSchema),
  completed: z.array(challengeRowSchema),
  missed: z.array(challengeRowSchema),
});
export type ChallengesResponse = z.infer<typeof challengesResponseSchema>;

// ---------------------------------------------------------------- badges and the trophy case (board 9)

export const badgeSchema = badgeAwardSchema.extend({
  earned: z.boolean(),
  awardedAt: timestamp.nullable(),
  /** How far away a locked badge is, where it can be measured. */
  progress: z.object({ value: z.number(), target: z.number() }).nullable(),
});
export type Badge = z.infer<typeof badgeSchema>;

export const rankTitleSchema = z.strictObject({
  title: z.string(),
  fromLevel: z.number().int(),
  /** Last level of the band; null for the top band. */
  toLevel: z.number().int().nullable(),
});

export const badgesResponseSchema = z.strictObject({
  badges: z.array(badgeSchema),
  earned: z.number().int(),
  total: z.number().int(),
  level: z.number().int(),
  titles: z.array(rankTitleSchema),
});
export type BadgesResponse = z.infer<typeof badgesResponseSchema>;

// ---------------------------------------------------------------- rewards (board 12, plan 6.5)

export const rewardKinds = ["freeze", "drill_unlock", "frame", "voucher", "real_world"] as const;

export const rewardItemSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  kind: z.enum(rewardKinds),
  title: z.string(),
  description: z.string().nullable(),
  coinPrice: z.number().int(),
  perUserLimit: z.number().int().nullable(),
  perUserPeriod: z.enum(["month", "lifetime"]).nullable(),
  /** P0 spends are the freeze and the drill unlock; the rest arrive in phase 10. */
  available: z.boolean(),
  affordable: z.boolean(),
});
export type RewardItem = z.infer<typeof rewardItemSchema>;

export const unlockableDrillSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  durationMinutes: z.number().int().nullable(),
  coinPrice: z.number().int(),
  programTitle: z.string(),
});
export type UnlockableDrill = z.infer<typeof unlockableDrillSchema>;

export const rewardsResponseSchema = z.strictObject({
  coins: z.number().int(),
  coinsThisWeek: z.number().int(),
  freezesHeld: z.number().int(),
  freezeMax: z.number().int(),
  items: z.array(rewardItemSchema),
  /** Drills a coin unlock can open: titles and prices, never a video reference (rule 5). */
  unlockableDrills: z.array(unlockableDrillSchema),
  redemptions: z.array(
    z.object({
      id: z.uuid(),
      itemId: z.uuid(),
      status: z.enum(["requested", "confirmed", "fulfilled", "cancelled"]),
      createdAt: timestamp,
    }),
  ),
});
export type RewardsResponse = z.infer<typeof rewardsResponseSchema>;

/** POST /rewards/purchase: the item and, for a drill unlock, the drill. */
export const rewardPurchaseRequestSchema = z.strictObject({
  itemId: z.uuid(),
  drillId: z.uuid().optional(),
});
export type RewardPurchaseRequest = z.infer<typeof rewardPurchaseRequestSchema>;

export const rewardPurchaseResponseSchema = z.strictObject({
  itemId: z.uuid(),
  kind: z.enum(rewardKinds),
  coinsSpent: z.number().int(),
  coinsBalance: z.number().int(),
  freezesHeld: z.number().int(),
  entitlementId: z.uuid().nullable(),
});
export type RewardPurchaseResponse = z.infer<typeof rewardPurchaseResponseSchema>;
