import { homeResponseSchema, type HomeResponse } from "@eyeq/api-contract";
import arjun from "./home-arjun.json";

/**
 * GET /home for seeded Arjun R. (recorded from home_payload on the seed) and the streak
 * states of boards 13a to 13c built from it. Development tooling, like the gallery.
 */
export const STATES = ["pending", "at_risk", "frozen", "ended", "done", "free"] as const;
export type PreviewState = (typeof STATES)[number];

const base = homeResponseSchema.parse(arjun);

function dayBefore(iso: string, n = 1): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export function homeFor(state: PreviewState): HomeResponse {
  const h = structuredClone(base);
  const yesterday = dayBefore(h.localDate);
  switch (state) {
    case "at_risk":
      h.streak.state = "at_risk";
      return h;
    case "frozen":
      h.streak = {
        ...h.streak,
        state: "frozen",
        frozenDay: yesterday,
        freezesHeld: 0,
        week: h.streak.week.map((d) => (d.date === yesterday ? { ...d, status: "frozen" } : d)),
      };
      return h;
    case "ended":
      h.streak = {
        ...h.streak,
        state: "ended",
        current: 0,
        lastRun: 12,
        lastTrained: dayBefore(h.localDate, 2),
        multiplier: 1,
      };
      if (h.today.kind === "program")
        h.today.xpPreview = { drills: 40, sessionBonus: 25, multiplier: 0, total: 65 };
      if (h.weeklyRank) h.weeklyRank = { ...h.weeklyRank, delta: -1 };
      return h;
    case "done":
      h.streak = { ...h.streak, state: "done", current: h.streak.current + 1 };
      if (h.today.kind === "program") {
        h.today.completed = true;
        h.today.drills = h.today.drills.map((d) => ({ ...d, done: true }));
      }
      return h;
    case "free": {
      const first = h.today.kind === "program" ? h.today.drills[0] : undefined;
      if (!first) return h;
      h.today = {
        kind: "free",
        drillId: first.drillId,
        title: first.title,
        estMinutes: first.durationMinutes,
        drills: [{ ...first, order: 1 }],
        completed: false,
        locked: "paywall",
        programLocked: "paywall",
        xpPreview: { drills: 10, sessionBonus: 25, multiplier: 4, total: 39 },
        localDate: h.localDate,
      };
      return h;
    }
    default:
      return h;
  }
}
