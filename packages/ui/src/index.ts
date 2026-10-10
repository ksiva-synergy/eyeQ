/**
 * @eyeq/ui: design tokens (generated from docs/design/tokens.json) shared by
 * web and native. Web components are in "@eyeq/ui/web"; the CSS theme in
 * "@eyeq/ui/theme.css" and base styles in "@eyeq/ui/styles.css".
 */
export {
  tokens,
  type Tokens,
  type ThemeName,
  type ColorToken,
  type TypographyToken,
} from "./tokens.ts";

export const THEMES = ["dark", "light"] as const;
