import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/integration/**/*.integration.test.ts"],
    environment: "node",
    fileParallelism: false,
    setupFiles: ["./src/integration/no-parallel-queries.ts"],
  },
});
