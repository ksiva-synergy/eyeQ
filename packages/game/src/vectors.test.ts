import { describe, expect, it } from "vitest";
import levels from "../vectors/levels.json";
import xp from "../vectors/xp.json";
import cap from "../vectors/cap.json";
import streak from "../vectors/streak.json";
import {
  applyDailyCap,
  bestStreak,
  currentStreak,
  levelForXp,
  levelProgress,
  levelThreshold,
  multiplierBonus,
  rankTitle,
  roundHalfUp,
  sessionXp,
  streakBefore,
  streakMultiplier,
  type StreakDay,
  type XpReason,
} from "./index.js";

describe("levels (vectors/levels.json)", () => {
  it.each(levels.thresholds)("level $level starts at $threshold XP", ({ level, threshold }) => {
    expect(levelThreshold(level)).toBe(threshold);
  });
  it.each(levels.level_for_xp)("$xp XP is level $level", (c) => {
    expect(levelForXp(c.xp)).toBe(c.level);
    if ("to_next" in c) expect(levelProgress(c.xp).toNext).toBe(c.to_next);
  });
  it.each(levels.rank_titles)("level $level is $title", ({ level, title }) => {
    expect(rankTitle(level)).toBe(title);
  });
});

describe("xp (vectors/xp.json)", () => {
  it.each(xp.multiplier)("streak $streak gives ×$factor", ({ streak: s, factor }) => {
    expect(streakMultiplier(s)).toBeCloseTo(factor, 10);
  });
  it.each(xp.sessions)("$name", (c) => {
    const r = sessionXp(c.drills, c.streak);
    expect(r.drillXp).toBe(c.drill_xp);
    expect(r.bonus).toBe(c.bonus);
    expect(r.multiplier).toBe(c.multiplier);
    expect(r.total).toBe(c.total);
    expect(multiplierBonus(c.drill_xp + c.bonus, c.streak)).toBe(c.multiplier);
  });
  it.each(xp.round_half_up)("round_half_up($value) = $rounded", ({ value, rounded }) => {
    expect(roundHalfUp(value)).toBe(rounded);
  });
});

describe("daily cap (vectors/cap.json)", () => {
  it.each(cap.cases)("$so_far so far, $reason +$requested -> $awarded", (c) => {
    expect(applyDailyCap(c.so_far, c.requested, c.reason as XpReason)).toEqual({
      awarded: c.awarded,
      truncated: c.truncated,
    });
  });
});

describe("streak (vectors/streak.json)", () => {
  it.each(streak.cases)("$name", (c) => {
    const days: StreakDay[] = c.days.map(([date, k]) => ({
      date: date!,
      kind: k === "c" ? "completed" : "frozen",
    }));
    expect(currentStreak(days, c.today)).toBe(c.current);
    expect(bestStreak(days)).toBe(c.best);
    expect(streakBefore(days, c.today)).toBe(c.before);
  });
});
