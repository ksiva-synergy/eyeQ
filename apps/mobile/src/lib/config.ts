import Constants from "expo-constants";

/**
 * Where the app server is (DECISIONS.md, phase 8: app variants). EXPO_PUBLIC_API_URL is
 * inlined at build time: the dev machine's LAN address in development (set in
 * apps/mobile/.env), https://eyeq-nu.vercel.app on staging (eas.json). Not a secret.
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");

export const VARIANT = String(Constants.expoConfig?.extra?.["variant"] ?? "development");
