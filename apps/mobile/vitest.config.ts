import { defineConfig } from "vitest/config";

/** Unit tests for the app's plain TypeScript (session, config); no React Native here. */
export default defineConfig({
  test: { include: ["src/**/*.test.ts"] },
});
