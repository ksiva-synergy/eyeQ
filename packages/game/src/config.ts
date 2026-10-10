import defaults from "../../../db/seed/game_config.json";

/** Rule values the engine needs. Seeded into game_config; loaded here from the same file (rule 8). */
export interface GameRules {
  xpPerDrill: number;
  xpSessionBonus: number;
  xpPersonalBest: number;
  xpDailyCap: number;
  levelBase: number;
  levelExponent: number;
  rankTitles: { title: string; from: number }[];
  multiplierStep: number;
  multiplierDays: number;
  multiplierCap: number;
  freezeMaxHeld: number;
}

type Raw = Record<string, unknown>;
const raw = defaults as Raw;

function num(key: string): number {
  const v = raw[key];
  if (typeof v !== "number") throw new Error(`game_config.json: ${key} is not a number`);
  return v;
}

/** Build rules from a flat `key -> value` map (the shape of game_config rows). */
export function rulesFrom(map: Raw): GameRules {
  const get = (k: string): unknown => (k in map ? map[k] : raw[k]);
  const n = (k: string): number => {
    const v = get(k);
    if (typeof v !== "number") throw new Error(`rule ${k} is not a number`);
    return v;
  };
  return {
    xpPerDrill: n("xp.drill"),
    xpSessionBonus: n("xp.session_bonus"),
    xpPersonalBest: n("xp.personal_best"),
    xpDailyCap: n("xp.daily_cap"),
    levelBase: n("level.base"),
    levelExponent: n("level.exponent"),
    rankTitles: get("level.rank_titles") as { title: string; from: number }[],
    multiplierStep: n("streak.multiplier_step"),
    multiplierDays: n("streak.multiplier_days"),
    multiplierCap: n("streak.multiplier_cap"),
    freezeMaxHeld: n("streak.freeze_max_held"),
  };
}

export const DEFAULT_RULES: GameRules = rulesFrom({});
void num;
