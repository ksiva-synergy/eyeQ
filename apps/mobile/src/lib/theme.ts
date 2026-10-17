import { tokens, type ColorToken } from "@eyeq/ui";
import { useColorScheme } from "react-native";

/** The token colours for the OS theme: dark is primary, light follows the OS (plan 8). */
export function useColors(): Record<ColorToken, string> {
  return tokens.color[useColorScheme() === "light" ? "light" : "dark"];
}

/** 44 pt minimum touch target (rule 13). */
export const TOUCH = 44;
export const GUTTER = 20;
