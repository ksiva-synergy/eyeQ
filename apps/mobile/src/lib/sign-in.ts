import type { MessageKey } from "@eyeq/i18n";
import { t } from "@eyeq/i18n";

/**
 * Sign-in helpers ported from apps/web's sign-in form, so the two read the same. No login
 * names here: the QA master login is web-only (DECISIONS.md, phase 8).
 */
export type Target = { phone: string } | { email: string };

/** Seconds before "Resend code" works; Supabase Auth also keeps a minimum gap per phone. */
export const RESEND_AFTER_S = 30;

/** An email has an @, a phone is digits (with + spaces and dashes); anything else is null. */
export function classify(raw: string): Target | null {
  const v = raw.trim();
  if (v === "") return null;
  if (v.includes("@")) return { email: v };
  if (/^[+\d\s()-]+$/.test(v)) return { phone: v };
  return null;
}

/** "9840000005" → "+91 98400 00005"; an email or anything else as typed. */
export function shown(target: Target): string {
  if ("email" in target) return target.email.trim();
  const d = target.phone.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
  return d.length === 10
    ? `${t("input.phonePrefix")} ${d.slice(0, 5)} ${d.slice(5)}`
    : target.phone;
}

export function errorKey(code: string | undefined): MessageKey {
  switch (code) {
    case "rate_limited":
      return "auth.error.rate_limited";
    case "otp_invalid":
      return "auth.error.otp_invalid";
    case "validation_failed":
      return "auth.error.validation_failed";
    case "unavailable":
      return "auth.error.unavailable";
    case "network":
      return "auth.error.network";
    default:
      return "auth.error.generic";
  }
}
