import { DEFAULT_RULES, type GameRules } from "./config.js";

/** Round half up, as the multiplier rule requires (71.5 -> 72). */
export function roundHalfUp(value: number): number {
  return Math.floor(value + 0.5);
}

/** +10% per full 7 days of streak, capped at +50% (plan 6.1). Returns the factor (1.0 .. 1.5). */
export function streakMultiplier(streak: number, rules: GameRules = DEFAULT_RULES): number {
  const steps = Math.floor(streak / rules.multiplierDays);
  // keep to one decimal place so 0.1 * 3 does not read as 0.30000000000000004
  return 1 + Math.min(Math.round(steps * rules.multiplierStep * 100) / 100, rules.multiplierCap);
}

/** The multiplier ledger row for a session base: round_half_up(base * factor) - base. */
export function multiplierBonus(
  base: number,
  streakBefore: number,
  rules: GameRules = DEFAULT_RULES,
): number {
  return roundHalfUp(base * streakMultiplier(streakBefore, rules)) - base;
}

export interface SessionXp {
  drillXp: number;
  bonus: number;
  multiplier: number;
  factor: number;
  total: number;
}

/**
 * Nominal XP for completing a session: the sum of its drills' XP, the session bonus, and the
 * multiplier on that base using the streak the athlete started the day with (D14). This is a
 * preview; the server's result object is authoritative (rule 1).
 */
export function sessionXp(
  drillXps: number[],
  streakBefore: number,
  rules: GameRules = DEFAULT_RULES,
): SessionXp {
  const drillXp = drillXps.reduce((a, b) => a + b, 0);
  const bonus = rules.xpSessionBonus;
  const base = drillXp + bonus;
  const multiplier = multiplierBonus(base, streakBefore, rules);
  return {
    drillXp,
    bonus,
    multiplier,
    factor: streakMultiplier(streakBefore, rules),
    total: base + multiplier,
  };
}

export type XpReason =
  | "drill"
  | "session_bonus"
  | "personal_best"
  | "streak_multiplier"
  | "challenge"
  | "program_complete"
  | "admin";

const CAPPED: ReadonlySet<XpReason> = new Set([
  "drill",
  "session_bonus",
  "personal_best",
  "streak_multiplier",
]);

export function isCapped(reason: XpReason): boolean {
  return CAPPED.has(reason);
}

/** Apply the daily cap to one award (plan 6.1, D13). */
export function applyDailyCap(
  soFar: number,
  requested: number,
  reason: XpReason,
  rules: GameRules = DEFAULT_RULES,
): { awarded: number; truncated: boolean } {
  const wanted = Math.max(requested, 0);
  if (!isCapped(reason)) return { awarded: wanted, truncated: false };
  const awarded = Math.max(Math.min(wanted, rules.xpDailyCap - soFar), 0);
  return { awarded, truncated: awarded < wanted };
}
