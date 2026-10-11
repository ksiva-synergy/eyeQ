import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { scaleText, textProblems } from "./text-scale";
import { smallTargets } from "./touch-targets";

/**
 * Today (plan phase 5; boards 2, 13a to 13c, 16) from /dev/today, which renders the real
 * component from seeded Arjun's GET /home and the streak states built from it. The
 * signed-in Today is checked in the Supabase job (auth.spec.ts, onboarding journey).
 */
async function axe(page: Page) {
  const r = await new AxeBuilder({ page })
    .include("main")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
}

const STATES: { state: string; sees: (string | RegExp)[] }[] = [
  {
    state: "pending",
    sees: ["12", "Today pending", "4 drills · 14 min", "+72", "Start session", "223 to Lvl 8"],
  },
  {
    state: "at_risk",
    sees: [
      "Your 12-day streak ends at midnight",
      "One session keeps it.",
      "At risk",
      /Your held freeze covers today/,
    ],
  },
  {
    state: "frozen",
    sees: [
      "day streak · kept",
      /frozen · train today to keep it alive/,
      "Start session · make it 13",
      /Streak freeze used for/,
    ],
  },
  {
    state: "ended",
    sees: [
      "Best streak",
      "Last streak",
      "XP kept",
      "+65",
      "Start day 1 of a new streak",
      "Next time, freeze it",
    ],
  },
  { state: "done", sees: ["Today's session is done", "Today done"] },
  { state: "free", sees: ["Today's free drill", "1 drill · 4 min", /part of Pro/] },
];

for (const [width, height] of [
  [390, 844],
  [1440, 1000],
] as const) {
  test.describe(`Today at ${width} px`, () => {
    test.use({ viewport: { width, height } });

    for (const { state, sees } of STATES) {
      test(`${state}: reads like the board, 44 px targets, accessible`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
        await page.goto(`/dev/today?state=${state}`);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Arjun/i);
        for (const text of sees) await expect(page.getByText(text).first()).toBeVisible();
        expect(await smallTargets(page, "main")).toEqual([]);
        await axe(page);
      });
    }

    test("light theme passes accessibility checks", async ({ page }) => {
      await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
      await page.goto("/dev/today?state=at_risk");
      await axe(page);
    });

    test("nothing clips or overlaps at 200 % text", async ({ page }) => {
      await page.goto("/dev/today?state=frozen");
      // The freeze toast overlays the page on purpose and leaves after duration.toast.
      await expect(page.getByText(/Streak freeze used/)).toBeHidden({ timeout: 6_000 });
      await scaleText(page);
      expect(await textProblems(page, "main")).toEqual([]);
    });
  });
}

test("Start opens the session's player; the profile avatar opens Account", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dev/today?state=pending");
  await expect(page.getByRole("link", { name: "Start session" })).toHaveAttribute(
    "href",
    /^\/app\/session\/[0-9a-f-]{36}$/,
  );
  await expect(page.getByRole("link", { name: "Profile" }).first()).toHaveAttribute(
    "href",
    "/app/account",
  );
  await page.goto("/dev/today?state=free");
  await expect(page.getByRole("link", { name: "Start session" })).toHaveAttribute(
    "href",
    "/app/session/today",
  );
});
