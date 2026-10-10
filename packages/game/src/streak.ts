/**
 * Streak maths from facts (plan 6.4): completed days count, frozen days hold the run,
 * anything else ends it. Dates are ISO `YYYY-MM-DD` local dates.
 */
export type DayKind = "completed" | "frozen";
export interface StreakDay {
  date: string;
  kind: DayKind;
}

const DAY_MS = 86_400_000;

function dayNumber(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function addDays(iso: string, n: number): string {
  return new Date((dayNumber(iso) + n) * DAY_MS).toISOString().slice(0, 10);
}

function index(days: StreakDay[]): Map<number, DayKind> {
  const m = new Map<number, DayKind>();
  for (const d of days) {
    const n = dayNumber(d.date);
    // a completed day wins over a frozen one (a late sync refunds the freeze)
    if (d.kind === "completed" || !m.has(n)) m.set(n, d.kind);
  }
  return m;
}

/** Length of the run ending on `date`; 0 if that day is neither completed nor frozen. */
export function streakRun(days: StreakDay[], date: string): number {
  const m = index(days);
  let n = dayNumber(date);
  if (!m.has(n)) return 0;
  let run = 0;
  while (m.has(n)) {
    if (m.get(n) === "completed") run++;
    n--;
  }
  return run;
}

/** The streak as the athlete sees it today: today's run if done, else yesterday's. */
export function currentStreak(days: StreakDay[], today: string): number {
  const m = index(days);
  return m.get(dayNumber(today)) === "completed"
    ? streakRun(days, today)
    : streakRun(days, addDays(today, -1));
}

/** The streak a day started with, used for that day's multiplier. */
export function streakBefore(days: StreakDay[], date: string): number {
  return streakRun(days, addDays(date, -1));
}

export function bestStreak(days: StreakDay[]): number {
  const m = index(days);
  const keys = [...m.keys()].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  let prev: number | null = null;
  for (const k of keys) {
    if (prev !== null && k !== prev + 1) run = 0;
    if (m.get(k) === "completed") run++;
    best = Math.max(best, run);
    prev = k;
  }
  return best;
}
