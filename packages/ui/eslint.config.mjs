import base from "@eyeq/config/eslint";
import react from "eslint-plugin-react";

/**
 * Ground rule 16: user-facing text comes from @eyeq/i18n. jsx-no-literals
 * fails on any string written into JSX; separators and glyphs are allowed.
 */
export const noLiterals = {
  "react/jsx-no-literals": [
    "error",
    {
      noStrings: true,
      ignoreProps: true,
      allowedStrings: ["·", " · ", "+", "/", "×", "▲", "▼", " "],
    },
  ],
};

export default [
  ...base,
  {
    files: ["**/*.tsx"],
    ignores: ["**/*.test.tsx"],
    plugins: { react },
    settings: { react: { version: "19" } },
    rules: noLiterals,
  },
];
