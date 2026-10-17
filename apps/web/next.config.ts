import path from "node:path";
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";
import { robotsHeaders } from "./src/server/robots";

const nextConfig: NextConfig = {
  // Monorepo: trace files from the repo root so workspace packages are copied.
  outputFileTracingRoot: path.join(import.meta.dirname, "../../"),
  cacheComponents: true,
  // Outside production every response is noindex (src/server/robots.ts). APP_ENV is read
  // at build, so turbo.json passes it to the build task.
  async headers() {
    const headers = robotsHeaders(process.env["APP_ENV"]);
    return headers.length ? [{ source: "/:path*", headers }] : [];
  },
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

// Source maps upload only when SENTRY_AUTH_TOKEN (plus SENTRY_ORG, SENTRY_PROJECT) is set.
export default withSentryConfig(nextConfig, {
  org: process.env["SENTRY_ORG"],
  project: process.env["SENTRY_PROJECT"],
  authToken: process.env["SENTRY_AUTH_TOKEN"],
  silent: true,
  telemetry: false,
  sourcemaps: { disable: !process.env["SENTRY_AUTH_TOKEN"] },
});
