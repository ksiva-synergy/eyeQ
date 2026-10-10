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

const dateFormat = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});
const relativeFormat = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });

/** "10 Oct 2026". */
export function formatDate(iso: string | Date): string {
  return dateFormat.format(new Date(iso));
}

/** "10 Oct, 6:30 pm". */
export function formatDateTime(iso: string | Date): string {
  return dateTimeFormat.format(new Date(iso));
}

/** "today", "yesterday", "3 days ago", "2 weeks ago"; a date past eight weeks. */
export function formatRelativeDay(iso: string | Date, now: Date = new Date()): string {
  const day = (d: Date) => Math.floor((d.getTime() - d.getTimezoneOffset() * 60_000) / 86_400_000);
  const days = day(new Date(iso)) - day(now);
  if (days > -14) return relativeFormat.format(days, "day");
  if (days > -56) return relativeFormat.format(Math.round(days / 7), "week");
  return formatDate(iso);
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
