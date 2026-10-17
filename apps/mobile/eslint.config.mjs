import base from "@eyeq/config/eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  { ignores: ["dist/**", ".expo/**", "expo-env.d.ts", "android/**", "ios/**"] },
  ...base,
  reactHooks.configs.flat.recommended,
];
