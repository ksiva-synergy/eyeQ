import { expect, test } from "@playwright/test";

/**
 * Screenshot comparison of the Phase 3 gallery and the Phase 5, 6 and 7 screens at 390 × 844,
 * dark theme as the boards are drawn. Baselines are Linux renders from the official
 * Playwright image, so this runs only through scripts/visual.sh (CI and local alike);
 * `scripts/visual.sh --update-snapshots` rewrites them after an intended change.
 * The screens are the dev previews: recorded payloads, no session, nothing time-based.
 */
test.skip(!process.env["PW_WS_ENDPOINT"], "Linux renders only: run scripts/visual.sh");
test.use({ viewport: { width: 390, height: 844 }, colorScheme: "dark", reducedMotion: "reduce" });

const SCREENS: [name: string, url: string][] = [
  ["gallery", "/dev/components"],
  ...["pending", "at_risk", "frozen", "ended", "done", "free"].map((s): [string, string] => [
    `today-${s}`,
    `/dev/today?state=${s}`,
  ]),
  ["progress-rated", "/dev/progress?state=rated"],
  ["progress-new", "/dev/progress?state=new"],
  ["programs", "/dev/programs"],
  ["program-detail", "/dev/programs?view=detail"],
  ["program-detail-locked", "/dev/programs?view=detail&as=free"],
  ["account", "/dev/account"],
  ["compete", "/dev/compete"],
  ["compete-challenges", "/dev/compete?tab=challenges"],
  ["trophies", "/dev/trophies"],
  ["rewards", "/dev/rewards?as=free"],
  ["paywall", "/dev/paywall"],
  ["paywall-program", "/dev/paywall?program=1"],
];

for (const [name, url] of SCREENS) {
  test(`${name} matches its baseline`, async ({ page }) => {
    // Profile's web push row depends on the browser: CI serves localhost (a secure
    // context, so a service worker), a Mac reaches the app through host.docker.internal
    // (none). The same "this browser can't" state everywhere keeps one baseline.
    await page.addInitScript(() => {
      delete (Navigator.prototype as unknown as { serviceWorker?: unknown }).serviceWorker;
    });
    await page.goto(url);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    // The error boundary has a heading too: a crashed page must fail, not become a baseline.
    await expect(page.getByText(/This page couldn.t load/)).toHaveCount(0);
    // Streamed sections show skeletons first (the gallery shows them on purpose).
    if (name !== "gallery") await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
    // The freeze toast leaves on a timer; wait for it so the page is the same each run.
    if (url.includes("frozen")) {
      const toast = page.getByText(/Streak freeze used/);
      await expect(toast).toBeVisible();
      await expect(toast).toBeHidden({ timeout: 6_000 });
    }
    await expect(page).toHaveScreenshot(`${name}.png`, {
      fullPage: true,
      animations: "disabled",
      caret: "hide",
      // Anti-aliasing noise only; a moved or restyled element is far above this.
      maxDiffPixelRatio: 0.002,
    });
  });
}
