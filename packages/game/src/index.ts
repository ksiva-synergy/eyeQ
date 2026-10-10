/**
 * @eyeq/game: pure rules. No I/O, no dates from the clock, no config
 * constants: every rule value is passed in from `game_config` (ground rule 8).
 * Phase 1 fills this package in and drives it from `vectors/*.json`, the same
 * vectors the pgTAP suite runs (ground rule 9).
 */

/** Rule values the engine needs. Seeded in db/seed, loaded from game_config. */
export interface GameRules {
  xpPerDrill: number;
  xpSessionBonus: number;
  xpDailyCap: number;
  streakMultiplierStep: number;
  streakMultiplierCap: number;
  freezeMaxHeld: number;
}

/** Placeholder so the package builds and has one passing test in phase 0. */
export function roundHalfUp(value: number): number {
  return Math.floor(value + 0.5);
}
