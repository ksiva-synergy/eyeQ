import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel builds with its own adapter; the standalone server is for docker/Dockerfile.web
  // (local smoke test in CI, or any container host).
  output: process.env["VERCEL"] ? undefined : "standalone",
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
