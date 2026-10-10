/**
 * @eyeq/game: pure rules. No I/O and no clock. Every rule value comes from `GameRules`,
 * whose defaults load from db/seed/game_config.json, the same file the database seeds
 * (ground rule 8). The SQL engine and this package run the same vectors (ground rule 9).
 * The server's result object is authoritative; this package exists for previews
 * (offline summary, admin live preview) and for testing the rules twice.
 */
export { DEFAULT_RULES, rulesFrom, type GameRules } from "./config.js";
export {
  levelThreshold,
  levelForXp,
  rankTitle,
  levelProgress,
  type LevelProgress,
} from "./levels.js";
export {
  roundHalfUp,
  streakMultiplier,
  multiplierBonus,
  sessionXp,
  applyDailyCap,
  isCapped,
  type SessionXp,
  type XpReason,
} from "./xp.js";
export {
  streakRun,
  currentStreak,
  streakBefore,
  bestStreak,
  addDays,
  type StreakDay,
  type DayKind,
} from "./streak.js";
