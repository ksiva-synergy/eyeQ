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

export function t(key: MessageKey, vars?: MessageVars): string {
  const message: string = en[key];
  if (!vars) return message;
  return message.replace(/\{(\w+)\}/g, (match, name: string) => {
    const v = vars[name];
    if (v === undefined) return match;
    return typeof v === "number" ? formatNumber(v) : v;
  });
}
