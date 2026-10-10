import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["src/**/*.integration.test.ts", "node_modules/**"],
    environment: "node",
  },
  resolve: {
    alias: { "server-only": new URL("./test/server-only.ts", import.meta.url).pathname },
  },
});
