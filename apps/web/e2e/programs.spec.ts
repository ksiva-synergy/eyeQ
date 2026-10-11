import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { scaleText, textProblems } from "./text-scale";
import { settled } from "./settle";
import { smallTargets } from "./touch-targets";

/**
 * Programs (plan phase 5; boards 10a, 10b) from /dev/programs: seeded Arjun's recorded
 * GET /programs (he has Pro) and an athlete without it (?as=free). Enrolling signed in is
 * checked in the Supabase job.
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
  test.describe(`Programs at ${width} px`, () => {
    test.use({ viewport: { width, height } });

    test("catalogue: in progress, then the catalogue with access and filters", async ({ page }) => {
      await page.emulateMedia({ colorScheme: "dark" });
      await page.goto("/dev/programs");
      await expect(page.getByRole("heading", { name: "Train" })).toBeVisible();
      const progress = page.getByRole("region", { name: "In progress" });
      await expect(
        progress.getByRole("link", { name: /Cricket Vision Foundations/ }),
      ).toContainText("Day 13/21");
      const catalog = page.getByRole("region", { name: /Catalog/ });
      await expect(catalog.getByRole("heading")).toHaveText("Catalog · 3 programs");
      await expect(catalog.getByRole("link", { name: /3-Day Eye Health Reset/ })).toContainText(
        "Free",
      );
      await expect(catalog.getByRole("link", { name: /Reaction Edge/ })).toContainText(
        "Pro · or ₹1,299",
      );
      // Every seeded program trains all three areas; level and sport narrow it.
      await page
        .getByRole("group", { name: "Level" })
        .getByRole("button", { name: "Advanced" })
        .click();
      await expect(catalog.getByRole("heading")).toHaveText("Catalog · 1 program");
      await expect(catalog.getByRole("link", { name: /Focus Under Pressure/ })).toBeVisible();
      await page
        .getByRole("group", { name: "Level" })
        .getByRole("button", { name: "Intermediate" })
        .click();
      await page
        .getByRole("group", { name: "Sport" })
        .getByRole("button", { name: "Football" })
        .click();
      await expect(page.getByText("No program matches these filters.")).toBeVisible();
      await page.getByRole("button", { name: "Show all programs" }).click();
      await expect(catalog.getByRole("heading")).toHaveText("Catalog · 3 programs");
      expect(await smallTargets(page, "main")).toEqual([]);
      await axe(page);
      await page.emulateMedia({ colorScheme: "light" });
      await settled(page);
      await axe(page);
    });

    test("detail: modules, what you get, and switching from another program", async ({ page }) => {
      await page.goto("/dev/programs?view=detail");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Reaction Edge");
      await expect(page.getByRole("region", { name: "Modules" }).getByRole("listitem")).toHaveCount(
        4,
      );
      await expect(page.getByText("Not a substitute for an eye examination.")).toBeVisible();
      await expect(
        page
          .getByText("Your progress in Cricket Vision Foundations is kept")
          .filter({ visible: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Switch to this program" }).filter({ visible: true }),
      ).toBeVisible();
      expect(await smallTargets(page, "main")).toEqual([]);
      await axe(page);
    });

    test("locked detail says what opens it and that payments come later", async ({ page }) => {
      await page.goto("/dev/programs?view=detail&as=free");
      await expect(page.getByText("₹1,299").filter({ visible: true })).toBeVisible();
      await expect(page.getByText("Included in Pro").filter({ visible: true })).toBeVisible();
      await expect(
        page
          .getByRole("button", { name: /Unlock program · payments open/ })
          .filter({ visible: true }),
      ).toBeDisabled();
      await axe(page);
    });

    test("nothing clips or overlaps at 200 % text", async ({ page }) => {
      for (const url of ["/dev/programs", "/dev/programs?view=detail&as=free"]) {
        await page.goto(url);
        await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
        await scaleText(page);
        expect(await textProblems(page, "main")).toEqual([]);
      }
    });
  });
}
