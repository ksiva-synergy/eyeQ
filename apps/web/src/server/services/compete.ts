import type { Tx } from "@eyeq/db";
import {
  badgesResponseSchema,
  challengesResponseSchema,
  leaderboardResponseSchema,
  rewardPurchaseResponseSchema,
  rewardsResponseSchema,
  type BadgesResponse,
  type ChallengesResponse,
  type LeaderboardQuery,
  type LeaderboardResponse,
  type RewardPurchaseRequest,
  type RewardPurchaseResponse,
  type RewardsResponse,
} from "@eyeq/api-contract";
import type { z } from "zod";
import { camelize } from "./content";

/**
 * Compete and rewards (plan phase 6). Runs as eyeq_api inside the request transaction;
 * the SQL wrappers read the athlete from app.user_id, and every number is the engine's
 * (rule 1). Board rows are cut down to what rule 11 allows before they leave.
 */
function shaped<S extends z.ZodType>(schema: S, raw: unknown, what: string): z.output<S> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success)
    throw new Error(`${what} payload does not match the contract: ${parsed.error.message}`);
  return parsed.data;
}

async function one(query: Promise<{ v: unknown }[]>): Promise<unknown> {
  const [row] = await query;
  return row?.v ?? null;
}

type RawBoard = {
  period: string;
  scope: string;
  scope_value: string;
  week_start: string | null;
  resets_at: string;
  count: number;
  rows: {
    rank: number;
    display_name: string;
    initials: string;
    level: number | null;
    xp: number;
    delta: number | null;
    is_me: boolean;
  }[];
  me: {
    rank: number;
    xp: number;
    delta: number | null;
    is_public: boolean;
    gap_above: { xp: number; rank: number } | null;
  } | null;
};

/**
 * GET /leaderboards. Top 10 public athletes plus the athlete's own row, pinned. Private
 * athletes and minors (private by default, D11) are absent from `rows` but always see
 * their own rank in `me`.
 */
export async function getLeaderboard(tx: Tx, q: LeaderboardQuery): Promise<LeaderboardResponse> {
  const raw = (await one(
    tx.$queryRaw`select my_leaderboard(${q.period}, ${q.scope}, 10) as v`,
  )) as RawBoard;
  let me: LeaderboardResponse["me"] = null;
  if (raw.me) {
    const [p] = await tx.$queryRaw<
      { display_name: string; sport: string | null; level: number }[]
    >`select p.display_name, p.sport, coalesce(s.level, 1) as level
      from profiles p left join user_stats s on s.user_id = p.id
      where p.id = app_user_id()`;
    me = {
      rank: raw.me.rank,
      xp: raw.me.xp,
      delta: raw.me.delta,
      isPublic: raw.me.is_public,
      displayName: p?.display_name ?? "",
      initials: raw.rows.find((r) => r.is_me)?.initials ?? initialsOf(p?.display_name ?? ""),
      level: p?.level ?? 1,
      sport: p?.sport ?? null,
      gapAbove: raw.me.gap_above ? { xp: raw.me.gap_above.xp, rank: raw.me.gap_above.rank } : null,
    };
  }
  return shaped(
    leaderboardResponseSchema,
    {
      period: raw.period,
      scope: raw.scope,
      scopeValue: raw.scope_value,
      weekStart: raw.week_start,
      resetsAt: raw.resets_at,
      count: raw.count,
      // Only the fields rule 11 allows: no user id, no sport column, nothing else personal.
      rows: raw.rows.map((r) => ({
        rank: r.rank,
        displayName: r.display_name,
        initials: r.initials,
        level: r.level ?? 1,
        xp: r.xp,
        delta: r.delta,
        isMe: r.is_me,
      })),
      me,
    },
    "leaderboard",
  );
}

/** Same rule as the board's SQL: first letters of the first two words. */
function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

/** GET /challenges: active, completed and missed, each with the athlete's progress. */
export async function getChallenges(tx: Tx): Promise<ChallengesResponse> {
  const v = await one(tx.$queryRaw`select my_challenges() as v`);
  return shaped(challengesResponseSchema, camelize(v), "challenges");
}

/** GET /badges: every active badge, earned or locked with how far away, and the rank titles. */
export async function getBadges(tx: Tx): Promise<BadgesResponse> {
  const [row] = await tx.$queryRaw<{ badges: unknown; titles: unknown; level: number }[]>`
    select my_badges() as badges, config_value('level.rank_titles') as titles,
      coalesce((select level from user_stats where user_id = app_user_id()), 1) as level`;
  const badges = (camelize(row?.badges) ?? []) as { earned: boolean }[];
  const bands = (row?.titles ?? []) as { title: string; from: number }[];
  const titles = bands.map((b, i) => ({
    title: b.title,
    fromLevel: b.from,
    toLevel: bands[i + 1] ? bands[i + 1]!.from - 1 : null,
  }));
  return shaped(
    badgesResponseSchema,
    {
      badges,
      earned: badges.filter((b) => b.earned).length,
      total: badges.length,
      level: row?.level ?? 1,
      titles,
    },
    "badges",
  );
}

/** GET /rewards: balance, the spends, and the drills a coin unlock can open. */
export async function getRewards(tx: Tx): Promise<RewardsResponse> {
  const [row] = await tx.$queryRaw<{ r: Record<string, unknown>; d: unknown }[]>`
    select my_rewards() as r, my_unlockable_drills() as d`;
  return shaped(
    rewardsResponseSchema,
    camelize({ ...row?.r, unlockable_drills: row?.d ?? [] }),
    "rewards",
  );
}

/**
 * POST /rewards/purchase: a freeze or a drill unlock (P0). The spend and what it buys are
 * one transaction in purchase_reward; a balance never goes below zero (409 insufficient_coins).
 */
export async function purchaseReward(
  tx: Tx,
  body: RewardPurchaseRequest,
): Promise<RewardPurchaseResponse> {
  const v = await one(
    tx.$queryRaw`select purchase_reward(${body.itemId}::uuid, ${body.drillId ?? null}::uuid) as v`,
  );
  return shaped(rewardPurchaseResponseSchema, camelize(v), "purchase");
}
