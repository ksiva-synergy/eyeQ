import { formatShortWeekdayIn, t } from "@eyeq/i18n";

/**
 * "Mon · 2d 6h" (boards 6, 7): the reset's weekday in the athlete's zone and the time left.
 * `now` is the server's render time, so server and browser print the same label.
 */
export function resetsLabel(resetsAt: string, now: string, timeZone: string): string {
  const ms = Math.max(0, Date.parse(resetsAt) - Date.parse(now));
  const day = formatShortWeekdayIn(resetsAt, timeZone);
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 24) return t("compete.countdown", { day, d: Math.floor(hours / 24), h: hours % 24 });
  return t("compete.countdownHours", { day, h: hours, m: Math.floor((ms % 3_600_000) / 60_000) });
}
