import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PORT ?? 3000);
// Set PLAYWRIGHT_CHROMIUM_EXECUTABLE to use a Chromium other than the one
// `playwright install` downloads (for example a preinstalled one).
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // No retries: a flaky test must fail and be fixed at its cause, not pass on a second go.
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "on-first-retry",
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // CI runs the production build with `next start` (Vercel serves the same build);
    // locally the dev server is reused if already running.
    command: process.env.CI ? "pnpm start" : `pnpm dev -p ${port}`,
    url: `http://localhost:${port}/api/health`,
    // PW_REUSE_SERVER=1: CI's Supabase job starts the server itself, with Auth's env.
    reuseExistingServer: !process.env.CI || process.env.PW_REUSE_SERVER === "1",
    timeout: 120_000,
    env: { PORT: String(port) },
  },
});
