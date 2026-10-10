import { DEFAULT_RULES, type GameRules } from "./config.js";

/** Threshold for level n: round(base * n^exponent) for n >= 2; level 1 starts at 0 (plan 6.2). */
export function levelThreshold(level: number, rules: GameRules = DEFAULT_RULES): number {
  if (level <= 1) return 0;
  return Math.round(rules.levelBase * Math.pow(level, rules.levelExponent));
}

/** Highest level whose threshold is at or below the XP, never below 1. */
export function levelForXp(xp: number, rules: GameRules = DEFAULT_RULES): number {
  if (xp <= 0) return 1;
  let n = Math.max(1, Math.floor(Math.pow(xp / rules.levelBase, 1 / rules.levelExponent)));
  while (levelThreshold(n + 1, rules) <= xp) n++;
  while (n > 1 && levelThreshold(n, rules) > xp) n--;
  return n;
}

export function rankTitle(level: number, rules: GameRules = DEFAULT_RULES): string {
  const bands = [...rules.rankTitles].sort((a, b) => b.from - a.from);
  return bands.find((b) => b.from <= level)?.title ?? bands[bands.length - 1]!.title;
}

export interface LevelProgress {
  level: number;
  title: string;
  totalXp: number;
  xpInLevel: number;
  xpForLevel: number;
  toNext: number;
  nextThreshold: number;
}

export function levelProgress(xp: number, rules: GameRules = DEFAULT_RULES): LevelProgress {
  const level = levelForXp(xp, rules);
  const floor = levelThreshold(level, rules);
  const next = levelThreshold(level + 1, rules);
  return {
    level,
    title: rankTitle(level, rules),
    totalXp: xp,
    xpInLevel: xp - floor,
    xpForLevel: next - floor,
    toNext: next - xp,
    nextThreshold: next,
  };
}
