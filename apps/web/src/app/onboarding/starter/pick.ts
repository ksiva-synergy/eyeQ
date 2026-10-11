import type { ProgramCard } from "@eyeq/api-contract";

/** A goal from board 1c, and the measurement group whose drills serve it. */
const GOAL_GROUP: Record<string, ProgramCard["measurementGroups"][number]> = {
  reaction: "reaction",
  focus: "cognition",
  decisions: "cognition",
  tracking: "vision",
};

/**
 * How well a program fits the athlete: their sport is tagged (+2), the program trains the
 * group their goal names (+1), and a program built for fewer sports is more specific
 * (+0 to 1). Recommendations proper are P1 (phase 10); this is the starter step's pick.
 */
export function fit(p: ProgramCard, sport: string | null, goal: string | null): number {
  const sportScore = sport && p.sportTags.includes(sport) ? 2 : 0;
  const goalGroup = goal ? GOAL_GROUP[goal] : undefined;
  const goalScore = goalGroup && p.measurementGroups.includes(goalGroup) ? 1 : 0;
  const specific = p.sportTags.length > 0 ? 1 / p.sportTags.length : 0;
  return sportScore + goalScore + specific;
}

export type StarterPick = {
  /** The program the first session comes from: the best fit the athlete can open. */
  starter: ProgramCard | null;
  /** Shown second: the recommendation they cannot open yet, or a lighter free one. */
  other: ProgramCard | null;
  otherKind: "whenReady" | "lighter" | null;
};

export function pickStarter(
  programs: ProgramCard[],
  sport: string | null,
  goal: string | null,
): StarterPick {
  const byFit = [...programs].sort(
    (a, b) => fit(b, sport, goal) - fit(a, sport, goal) || a.durationDays - b.durationDays,
  );
  const recommended = byFit[0] ?? null;
  const starter = byFit.find((p) => p.hasAccess) ?? null;
  if (!starter)
    return { starter: null, other: recommended, otherKind: recommended ? "whenReady" : null };
  if (recommended && recommended.id !== starter.id) {
    return { starter, other: recommended, otherKind: "whenReady" };
  }
  const lighter = byFit.find((p) => p.isFree && p.id !== starter.id) ?? null;
  return { starter, other: lighter, otherKind: lighter ? "lighter" : null };
}
