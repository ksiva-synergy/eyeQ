import { defineConfig } from "vitest/config";

/** Integration tests against a local database (DATABASE_URL), run by `pnpm test:integration`. */
export default defineConfig({
  test: {
    include: ["src/**/*.integration.test.ts"],
    environment: "node",
    fileParallelism: false,
    env: { LOG_SILENT: "1" },
  },
  resolve: {
    alias: {
      "server-only": new URL("./test/server-only.ts", import.meta.url).pathname,
      "@/": new URL("./src/", import.meta.url).pathname,
    },
  },
});
