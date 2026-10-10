/**
 * @eyeq/i18n: the English message catalogue with typed keys (ground rule 16).
 * Tamil and Hindi slot in later as further catalogues with the same keys.
 */
export const en = {
  "app.name": "EyeQ",
  "app.tagline": "Train your eyes. Every day.",
  "common.continue": "Continue",
  "common.loading": "Loading",
} as const;

export type MessageKey = keyof typeof en;

export function t(key: MessageKey): string {
  return en[key];
}
