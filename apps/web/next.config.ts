import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Container Apps runs the standalone server from docker/Dockerfile.web.
  output: "standalone",
  // Monorepo: trace files from the repo root so workspace packages are copied.
  outputFileTracingRoot: path.join(import.meta.dirname, "../../"),
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
