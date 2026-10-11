import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { settled } from "./settle";
import { scaleText, textProblems } from "./text-scale";
import { smallTargets } from "./touch-targets";

/**
 * Compete (boards 6, 7), Trophy case (board 9) and Rewards (board 12), plan phase 6, from
 * the dev previews: seeded Arjun's recorded payloads. The signed-in screens read the same
 * components (checked in the phase 6 acceptance journey).
 */
async function axe(page: Page) {
  const r = await new AxeBuilder({ page })
    .include("main")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
}

async function bothThemes(page: Page) {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await settled(page);
  await axe(page);
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await settled(page);
  await axe(page);
}

for (const [width, height] of [
  [390, 844],
  [1440, 1000],
] as const) {
  test.describe(`Compete at ${width} px`, () => {
    test.use({ viewport: { width, height } });

    test("leaderboard: podium, top 10, the own row pinned; sport filter; 44 px targets; accessible", async ({
      page,
    }) => {
      await page.goto("/dev/compete");
      await expect(page.getByRole("heading", { name: "Compete" })).toBeVisible();
      await expect(page.getByText("Resets Mon · 5h 23m")).toBeVisible();
      const podium = page.getByRole("list", { name: "Top three" });
      await expect(podium.getByRole("listitem")).toHaveCount(3);
      await expect(podium.getByText("Place 1: Rohan S., 612 XP")).toBeAttached();
      await expect(
        page.getByRole("list", { name: "Ranks 4 to 10" }).getByRole("listitem"),
      ).toHaveCount(7);
      const pinned = page.getByTestId("pinned-me");
      await expect(pinned).toContainText("You · Arjun R.");
      await expect(pinned).toContainText("43 XP to Nikhil T.");
      await expect(pinned).not.toContainText("today's session passes");
      await expect(page.getByText("19 athletes")).toBeVisible();
      // The rank-change moment: up 4 today, past Priya.
      await expect(page.getByRole("status").getByText("Up 4 today")).toBeVisible();

      await page.getByRole("button", { name: "My sport · Cricket" }).click();
      await expect(page.getByRole("button", { name: "My sport · Cricket" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect(page.getByText("14 athletes")).toBeVisible();
      await expect(pinned).toContainText("128 XP to Meera D.");
      await page.getByRole("radio", { name: "All time" }).click();
      await expect(pinned).toContainText("2,040");

      expect(await smallTargets(page, "main")).toEqual([]);
      await bothThemes(page);
    });

    test("the rank-change moment plays once for a new rank, then not again", async ({ page }) => {
      await page.goto("/dev/compete");
      const moment = page.getByRole("status").filter({ hasText: "Up 4 today" });
      await expect(moment).toContainText("You passed Priya M.");
      await page.reload();
      await expect(page.getByRole("heading", { name: "Compete" })).toBeVisible();
      await expect(page.getByTestId("pinned-me")).toBeVisible();
      await expect(moment).toHaveCount(0);
    });

    test("a private athlete is off the rows and still sees their own rank", async ({ page }) => {
      await page.goto("/dev/compete?state=private");
      await expect(page.getByRole("heading", { name: "Compete" })).toBeVisible();
      await expect(
        page.getByRole("list", { name: /Ranks/ }).getByText("You · Arjun R."),
      ).toHaveCount(0);
      await expect(page.getByTestId("pinned-me")).toContainText("You · Arjun R.");
      await expect(page.getByRole("link", { name: "Show me on boards" })).toBeVisible();
    });

    test("challenges: the weekly challenge and the program challenges", async ({ page }) => {
      await page.goto("/dev/compete?tab=challenges");
      await expect(page.getByRole("radio", { name: "Challenges" })).toHaveAttribute(
        "aria-checked",
        "true",
      );
      const weekly = page.getByRole("region", { name: "Active · weekly" });
      await expect(weekly.getByText("5 sessions this week")).toBeVisible();
      await expect(weekly.getByText("Complete")).toBeVisible();
      const program = page.getByRole("region", { name: "Program challenges" });
      await expect(program.getByText("Finish Module 2 by Sunday")).toBeVisible();
      await expect(program.getByText("1 athlete in")).toBeVisible();
      // Finished this week, it is listed once, under Active, not again under Completed.
      await expect(page.getByText("5 sessions this week")).toHaveCount(1);
      expect(await smallTargets(page, "main")).toEqual([]);
      await bothThemes(page);
    });

    test("nothing clips or overlaps at 200 % text", async ({ page }) => {
      for (const url of ["/dev/compete", "/dev/compete?tab=challenges"]) {
        await page.goto(url);
        await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
        await scaleText(page);
        await settled(page); // the rank moment's swap lands first
        expect(await textProblems(page, "main")).toEqual([]);
      }
    });
  });

  test.describe(`Trophy case at ${width} px`, () => {
    test.use({ viewport: { width, height } });

    test("rank titles with the athlete's band, badges, and a locked badge says how far", async ({
      page,
    }) => {
      await page.goto("/dev/trophies");
      await expect(page.getByRole("heading", { name: "Trophy case" })).toBeVisible();
      await expect(page.getByLabel("7 of 17 badges earned")).toBeVisible();
      const titles = page.getByRole("region", { name: "Rank titles" });
      await expect(titles.locator('[aria-current="true"]')).toContainText("Prospect");
      await expect(titles.locator('[aria-current="true"]')).toContainText("you");
      await page.getByRole("button", { name: "Thirty Strong, Locked" }).click();
      const sheet = page.getByRole("dialog", { name: "Thirty Strong" });
      await expect(sheet.getByText("How to earn it")).toBeVisible();
      await expect(sheet.getByText("12 of 30").first()).toBeVisible();
      expect(await smallTargets(page, '[role="dialog"]')).toEqual([]);
      await sheet.getByRole("button", { name: "Close" }).click();
      expect(await smallTargets(page, "main")).toEqual([]);
      await bothThemes(page);
    });

    test("nothing clips or overlaps at 200 % text", async ({ page }) => {
      await page.goto("/dev/trophies");
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      await scaleText(page);
      expect(await textProblems(page, "main")).toEqual([]);
    });
  });

  test.describe(`Rewards at ${width} px`, () => {
    test.use({ viewport: { width, height } });

    test("balance, the freeze and drill-unlock spends, and later rewards marked as coming", async ({
      page,
    }) => {
      await page.goto("/dev/rewards?as=free");
      await expect(page.getByRole("heading", { name: "Rewards" })).toBeVisible();
      await expect(page.getByTestId("coin-balance")).toHaveText("140");
      await expect(page.getByText("+40 this week")).toBeVisible();
      await expect(page.getByText("Protects one missed day · you hold 0 (max 2)")).toBeVisible();
      await expect(page.getByText("Soon").first()).toBeVisible();

      await page.getByRole("button", { name: "Buy" }).click();
      const confirm = page.getByRole("dialog", { name: "Buy a streak freeze?" });
      await expect(confirm.getByText("50 coins. You'll have 90 left.")).toBeVisible();
      expect(await smallTargets(page, '[role="dialog"]')).toEqual([]);
      await confirm.getByRole("button", { name: "Cancel" }).click();

      await page.getByRole("button", { name: "Choose" }).click();
      const drills = page.getByRole("dialog", { name: "Unlock a drill" });
      await expect(drills.getByText("Peripheral Flash Catch")).toBeVisible();
      await expect(drills.getByText("Reaction Edge · 3 min")).toBeVisible();
      await drills.getByRole("button", { name: "Unlock · 30 coins" }).first().click();
      await expect(
        page.getByRole("dialog", { name: "Unlock Peripheral Flash Catch?" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Cancel" }).click();

      expect(await smallTargets(page, "main")).toEqual([]);
      await bothThemes(page);
    });

    test("a Pro athlete is told every drill is already open", async ({ page }) => {
      await page.goto("/dev/rewards");
      await expect(page.getByText("you hold 1 (max 2)")).toBeVisible();
      await page.getByRole("button", { name: "Choose" }).click();
      await expect(
        page
          .getByRole("dialog", { name: "Unlock a drill" })
          .getByText("Every drill is already open to you."),
      ).toBeVisible();
    });

    test("nothing clips or overlaps at 200 % text", async ({ page }) => {
      await page.goto("/dev/rewards?as=free");
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      await scaleText(page);
      expect(await textProblems(page, "main")).toEqual([]);
    });
  });
}
