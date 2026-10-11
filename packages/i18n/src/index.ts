/**
 * @eyeq/i18n: the English message catalogue with typed keys (ground rule 16).
 * Tamil and Hindi slot in later as further catalogues with the same keys.
 *
 * Messages take `{name}` placeholders: t("streak.daysLabel", { n: 12 }).
 */
import { en } from "./en.ts";

export { en };
export type MessageKey = keyof typeof en;
export type MessageVars = Record<string, string | number>;

export const LOCALE = "en-IN";

const numberFormat = new Intl.NumberFormat(LOCALE);

/** 2040 → "2,040"; Indian grouping above a lakh (1,00,000). */
export function formatNumber(n: number): string {
  return numberFormat.format(n);
}

const relativeFormat = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });

/*
 * Every instant is formatted in a time zone the caller names: the athlete's profile zone
 * on athlete screens, the coach's profile zone in admin. Never the runtime's own zone, so
 * the server render and the browser's hydration print the same text wherever either runs.
 */

/** "10 Oct 2026" for an instant, on the calendar of `timeZone`. */
export function formatDate(iso: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  }).format(new Date(iso));
}

/**
 * "10 Oct 2026" for a calendar date ("2026-10-10") the server already worked out in the
 * athlete's zone. Read as that day, never shifted into the browser's zone.
 */
export function formatCalendarDate(isoDate: string): string {
  return formatDate(`${isoDate}T00:00:00Z`, "UTC");
}

/** "10 Oct, 6:30 pm" for an instant, in `timeZone`. */
export function formatDateTime(iso: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

const weekdayFormat = new Intl.DateTimeFormat(LOCALE, {
  weekday: "long",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const shortWeekdayFormat = new Intl.DateTimeFormat(LOCALE, { weekday: "short", timeZone: "UTC" });

/** A local calendar date ("2026-10-10") as "Friday, 10 Oct" without shifting zones. */
export function formatWeekdayDate(isoDate: string): string {
  return weekdayFormat.format(new Date(`${isoDate}T00:00:00Z`)).replace(",", "");
}

/** The weekday of an instant in a time zone: "Mon". */
export function formatShortWeekdayIn(iso: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE, { weekday: "short", timeZone }).format(new Date(iso));
}

/** A local calendar date as "Fri". */
export function formatShortWeekday(isoDate: string): string {
  return shortWeekdayFormat.format(new Date(`${isoDate}T00:00:00Z`));
}

/** The hour (0 to 23) of an instant in a time zone. */
export function hourIn(iso: string | Date, timeZone: string): number {
  const h = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(new Date(iso));
  return Number(h);
}

const rupees = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/** Money is integer paise (plan section 5): 129900 → "₹1,299". */
export function formatRupees(paise: number): string {
  return rupees.format(Math.round(paise) / 100);
}

/** An instant as a clock time in a time zone: "11:59 pm". */
export function formatTimeIn(iso: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE, { hour: "numeric", minute: "2-digit", timeZone }).format(
    new Date(iso),
  );
}

/**
 * "today", "yesterday", "3 days ago", "2 weeks ago"; a date past eight weeks. Days are
 * counted on the calendar of `timeZone`.
 */
export function formatRelativeDay(
  iso: string | Date,
  timeZone: string,
  now: Date = new Date(),
): string {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone });
  const day = (d: Date) => Date.parse(`${ymd.format(d)}T00:00:00Z`) / 86_400_000;
  const days = day(new Date(iso)) - day(now);
  if (days > -14) return relativeFormat.format(days, "day");
  if (days > -56) return relativeFormat.format(Math.round(days / 7), "week");
  return formatDate(iso, timeZone);
}

export function t(key: MessageKey, vars?: MessageVars): string {
  const message: string = en[key];
  if (!vars) return message;
  return message.replace(/\{(\w+)\}/g, (match, name: string) => {
    const v = vars[name];
    if (v === undefined) return match;
    return typeof v === "number" ? formatNumber(v) : v;
  });
}
