import { readFileSync } from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { smallTargets } from "./touch-targets";

/**
 * The challenge editor (plan phase 6, board 17): the weekly challenge in Game settings and
 * program challenges on the program page, from dev previews with the admin API answered
 * here. The API itself (windows, validation, audit) is tested in
 * src/server/services/admin/challenges.integration.test.ts.
 */
const badge = { id: "00000000-0000-4000-a000-0000000000b1", name: "Five-a-Week" };
const live = {
  id: "00000000-0000-4000-a000-0000000000c1",
  type: "weekly",
  title: "5 sessions this week",
  description: null,
  goal: { metric: "sessions_total", gte: 5 },
  windowStart: "2026-10-04T18:30:00.000Z",
  windowEnd: "2026-10-11T18:30:00.000Z",
  programId: null,
  rewardXp: 150,
  rewardCoins: 40,
  badgeId: badge.id,
  state: "live",
  joined: 12,
};

async function axe(page: Page) {
  const r = await new AxeBuilder({ page })
    .include("main")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
}

for (const width of [390, 1440]) {
  test.describe(`Weekly challenge editor at ${width} px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("shows the live challenge, schedules next week's, and sends what was entered", async ({
      page,
    }) => {
      let next: unknown = null;
      const posted: unknown[] = [];
      await page.route("**/api/admin/challenges", async (r) => {
        if (r.request().method() === "POST") {
          const body = r.request().postDataJSON() as Record<string, unknown>;
          posted.push(body);
          next = {
            ...live,
            id: "00000000-0000-4000-a000-0000000000c2",
            title: body["title"],
            goal: { metric: "sessions_total", gte: body["target"] },
            windowStart: "2026-10-11T18:30:00.000Z",
            windowEnd: "2026-10-18T18:30:00.000Z",
            state: "scheduled",
            joined: 0,
          };
          return r.fulfill({ status: 201, json: next });
        }
        return r.fulfill({
          json: {
            live,
            next,
            weekStart: "2026-10-05",
            nextWeekStart: "2026-10-12",
            recent: [],
            badges: [badge],
          },
        });
      });
      await page.goto("/dev/game");
      const section = page.getByRole("region", {
        name: "Weekly challenge · resets Monday 00:00 IST",
      });
      await expect(section.getByText("5 sessions this week")).toBeVisible();
      await expect(section.getByText("Live", { exact: true })).toBeVisible();
      await expect(
        section.getByText("None scheduled · the live one repeats from Monday."),
      ).toBeVisible();
      expect(await smallTargets(page, "main")).toEqual([]);
      await axe(page);

      await section.getByRole("button", { name: "Schedule one" }).click();
      const form = page.getByRole("form", { name: "Next week's challenge" });
      await form.getByLabel("Title").fill("Six a week");
      await form.getByLabel("Target sessions").fill("6");
      await form.getByLabel("Reward XP").fill("180");
      await form.getByLabel("Badge awarded").selectOption(badge.id);
      expect(await smallTargets(page, "main")).toEqual([]);
      await form.getByRole("button", { name: "Save challenge" }).click();
      await expect(section.getByText("Six a week")).toBeVisible();
      expect(posted).toEqual([
        {
          week: "next",
          title: "Six a week",
          description: null,
          rewardXp: 180,
          rewardCoins: 40,
          badgeId: badge.id,
          target: 6,
        },
      ]);
      await expect(section.getByRole("button", { name: "Remove" })).toBeVisible();
    });
  });
}

test.describe("Program challenges on the program page", () => {
  const program: unknown = JSON.parse(
    readFileSync(path.join(__dirname, "fixtures", "builder-program.json"), "utf8"),
  );
  const firstModule = (program as { modules: { id: string; title: string }[] }).modules[0]!;

  test("lists the program's challenges and offers its own modules as goals", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.route("**/api/admin/programs/*", (r) => r.fulfill({ json: program }));
    await page.route("**/api/admin/products", (r) => r.fulfill({ json: { products: [] } }));
    await page.route("**/api/admin/measurement-tags", (r) => r.fulfill({ json: { tags: [] } }));
    await page.route("**/api/admin/drills*", (r) => r.fulfill({ json: { drills: [] } }));
    await page.route("**/api/admin/programs/*/challenges", (r) =>
      r.fulfill({
        json: {
          badges: [badge],
          challenges: [
            {
              ...live,
              id: "00000000-0000-4000-a000-0000000000c3",
              type: "program",
              title: "Finish Module 2 by Sunday",
              goal: { metric: "module_sessions", moduleId: firstModule.id },
              programId: (program as { id: string }).id,
              rewardXp: 60,
              rewardCoins: 0,
              badgeId: null,
              joined: 1,
            },
          ],
        },
      }),
    );
    await page.goto("/dev/builder");
    const panel = page.getByRole("region", { name: "Program challenges" });
    await expect(panel.getByText("Finish Module 2 by Sunday")).toBeVisible();
    await expect(panel.getByText("5 Oct 2026 to 11 Oct 2026 · +60 XP · 1 joined")).toBeVisible();
    await panel.getByRole("button", { name: "Program challenge" }).click();
    const form = page.getByRole("form", { name: "Program challenge" });
    await expect(form.getByLabel("Module", { exact: true })).toContainText(firstModule.title);
    await form.getByLabel("Goal").selectOption("score_gte");
    await expect(form.getByLabel("Score to reach")).toHaveValue("25");
    expect(await smallTargets(page, "main")).toEqual([]);
  });
});
