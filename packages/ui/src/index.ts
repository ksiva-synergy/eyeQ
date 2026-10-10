/**
 * @eyeq/ui: tokens, icons and components.
 * Phase 3 generates `tokens.ts` from docs/design/tokens.json and adds the
 * web and native component sets. Until then this package only exports the
 * token file's shape so other packages can type against it.
 */
export type ThemeName = "dark" | "light";

export const THEMES: readonly ThemeName[] = ["dark", "light"] as const;
