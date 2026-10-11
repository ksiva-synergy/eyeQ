import type { MessageKey } from "@eyeq/i18n";

/**
 * The choices boards 1c and 14 offer. These are profile vocabulary, not rule values: the
 * sport is stored as its slug (boards filter by it), the goal as its slug.
 */
export const SPORTS = ["cricket", "badminton", "tennis", "football", "other"] as const;
export const GOALS = ["reaction", "focus", "tracking", "decisions"] as const;

export const sportKey = (s: string): MessageKey =>
  (SPORTS as readonly string[]).includes(s) ? (`sport.${s}` as MessageKey) : "sport.other";
export const goalKey = (g: string): MessageKey | null =>
  (GOALS as readonly string[]).includes(g) ? (`goal.${g}` as MessageKey) : null;

/** "14 / 03 / 2007", "14/3/2007" or "14032007" → "2007-03-14"; null if not a real past date. */
export function parseDob(input: string, today = new Date()): string | null {
  const digits = input.replace(/\D/g, "");
  const m =
    /^(\d{1,2})\D*(\d{1,2})\D*(\d{4})$/.exec(input.trim()) ??
    /^(\d{2})(\d{2})(\d{4})$/.exec(digits);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d)
    return null;
  const iso = dt.toISOString().slice(0, 10);
  if (iso < "1920-01-01" || iso > today.toISOString().slice(0, 10)) return null;
  return iso;
}
