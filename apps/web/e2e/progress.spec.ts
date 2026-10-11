import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { scaleText, textProblems } from "./text-scale";
import { settled } from "./settle";
import { smallTargets } from "./touch-targets";

/**
 * Progress (plan phase 5; boards 8, 16) from /dev/progress: seeded Arjun's GET /progress
 * with scores added. The signed-in page reads the same component (checked in the
 * acceptance journey).
 */
async function axe(page: Page) {
  const r = await new AxeBuilder({ page })
    .include("main")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
}

for (const [width, height] of [
  [390, 844],
  [1440, 1000],
] as const) {
  test.describe(`Progress at ${width} px`, () => {
    test.use({ viewport: { width, height } });

    test("reads like the board, 44 px targets, accessible in both themes", async ({ page }) => {
      await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
      await page.goto("/dev/progress");
      await expect(page.getByRole("heading", { name: "Progress" })).toBeVisible();
      for (const text of [
        "Sessions",
        "Minutes",
        "Best streak",
        "Sessions per week",
        "Streak calendar",
        "Score trend",
        "Baseline vs now",
      ]) {
        await expect(page.getByText(text, { exact: true }).first()).toBeVisible();
      }
      await expect(
        page.getByRole("img", { name: /^Sessions per week for the last 8 weeks/ }),
      ).toBeVisible();
      await expect(page.getByRole("img", { name: /^Near–Far Focus Shifts: 18 on/ })).toBeVisible();
      await expect(
        page.getByRole("img", { name: /^Self-ratings, baseline to now: Focus 2 → 4/ }),
      ).toBeVisible();
      await expect(page.getByText("Day 21: time to rate yourself again")).toBeVisible();
      await expect(page.getByText("They are not a measure of eye health.")).toBeVisible();
      expect(await smallTargets(page, "main")).toEqual([]);
      await axe(page);
      await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
      await settled(page);
      await axe(page);
    });

    test("the trend follows the drill picked", async ({ page }) => {
      await page.goto("/dev/progress");
      await page.getByRole("button", { name: "Number Recall Sprint" }).click();
      await expect(page.getByRole("img", { name: /^Number Recall Sprint: 6 on/ })).toBeVisible();
    });

    test("nothing clips or overlaps at 200 % text", async ({ page }) => {
      await page.goto("/dev/progress?state=rated");
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      await scaleText(page);
      expect(await textProblems(page, "main")).toEqual([]);
    });

    test("a new athlete sees the empty states", async ({ page }) => {
      await page.goto("/dev/progress?state=new");
      await expect(page.getByText("Your first session starts this page.")).toBeVisible();
      await expect(page.getByText("Log a score in the drill player")).toBeVisible();
      await expect(page.getByText("Rate yourself to see your starting line here.")).toBeVisible();
    });
  });
}

test.describe("Progress in a browser west of UTC", () => {
  // The athlete's profile zone is Asia/Kolkata; the browser's is not. Every date must be
  // the profile's, and the server's HTML must hydrate without a mismatch.
  test.use({ viewport: { width: 390, height: 844 }, timezoneId: "America/New_York" });

  test("shows every date in the profile's zone and hydrates cleanly", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.goto("/dev/progress?state=rated");
    await expect(page.getByRole("heading", { name: "Progress" })).toBeVisible();
    expect(await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)).toBe(
      "America/New_York",
    );
    // Score trend: first and last points are 2 and 10 Oct; New York's calendar would say 1 and 9.
    await expect(page.getByText("2 Oct 2026 · 18")).toBeVisible();
    await expect(page.getByText("10 Oct 2026", { exact: true })).toBeVisible();
    await expect(page.getByText(/1 Oct 2026|9 Oct 2026/)).toHaveCount(0);
    // The baseline instant, on the Kolkata calendar.
    await expect(page.getByText("Baseline · 1 Sept 2026")).toBeVisible();
    // The heatmap's day labels are the athlete's days too.
    await expect(page.locator('[aria-label^="7 Sept 2026"]')).toHaveCount(1);
    await settled(page);
    expect(errors).toEqual([]);
  });
});
