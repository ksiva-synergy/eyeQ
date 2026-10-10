/**
 * @eyeq/i18n: the English message catalogue with typed keys (ground rule 16).
 * Tamil and Hindi slot in later as further catalogues with the same keys.
 */
export const en = {
  "app.name": "EyeQ",
  "app.tagline": "Train your eyes. Every day.",
  "common.continue": "Continue",
  "common.loading": "Loading",
  "auth.title": "Sign in",
  "auth.subtitle": "Use your phone number or Google account.",
  "auth.phone.label": "Phone number",
  "auth.phone.hint": "Indian numbers can skip the +91.",
  "auth.phone.send": "Send code",
  "auth.code.label": "6-digit code",
  "auth.code.sentTo": "We sent a code to",
  "auth.code.verify": "Verify and sign in",
  "auth.code.change": "Use a different number",
  "auth.google": "Continue with Google",
  "auth.or": "or",
  "auth.signOut": "Sign out",
  "auth.error.rate_limited": "Too many codes requested. Wait a while and try again.",
  "auth.error.otp_invalid": "That code is not right, or it has expired.",
  "auth.error.validation_failed": "Check the number and try again.",
  "auth.error.google": "Google sign-in did not finish. Try again.",
  "auth.error.unavailable": "Sign-in is not available right now.",
  "auth.error.generic": "Something went wrong. Try again.",
  "home.signedInAs": "Signed in as",
  "home.unnamed": "New athlete",
  "home.level": "Level",
  "home.xp": "XP",
  "home.streak": "Day streak",
  "home.coins": "Coins",
  "home.placeholder": "Your training home arrives with the design system (phase 3).",
} as const;

export type MessageKey = keyof typeof en;

export function t(key: MessageKey): string {
  return en[key];
}
