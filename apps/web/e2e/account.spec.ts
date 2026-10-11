import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { settled } from "./settle";
import { scaleText, textProblems } from "./text-scale";
import { smallTargets } from "./touch-targets";

/**
 * Profile and account (plan phase 5; board 14) from /dev/account (seeded Arjun). Saving
 * signed in is checked in the Supabase job.
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
  test.describe(`Account at ${width} px`, () => {
    test.use({ viewport: { width, height } });

    test("reads like the board, 44 px targets, accessible in both themes", async ({ page }) => {
      await page.emulateMedia({ colorScheme: "dark" });
      await page.goto("/dev/account");
      await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
      await expect(page.getByText("Level 7 · Prospect")).toBeVisible();
      const purchases = page.getByRole("region", { name: "Purchases & entitlements" });
      await expect(purchases.getByText("EyeQ Pro")).toBeVisible();
      await expect(
        purchases.getByRole("link", { name: /Cricket Vision Foundations/ }),
      ).toContainText("Included in Pro · Day 13 of 21");
      const notifications = page.getByRole("region", { name: "Notifications" });
      await expect(notifications.getByRole("switch", { name: "Daily reminder" })).toBeChecked();
      await expect(notifications.getByRole("switch", { name: "Rank changes" })).not.toBeChecked();
      await expect(page.getByRole("switch", { name: "Show me on leaderboards" })).toBeChecked();
      await expect(page.getByRole("link", { name: /Help on WhatsApp/ })).toHaveAttribute(
        "href",
        "https://wa.me/910000000000",
      );
      await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
      await expect(page.getByText("Training, not diagnosis")).toBeVisible();
      expect(await smallTargets(page, "main")).toEqual([]);
      await axe(page);
      await page.emulateMedia({ colorScheme: "light" });
      await settled(page);
      await axe(page);
    });

    test("edit opens a sheet with the profile fields", async ({ page }) => {
      await page.goto("/dev/account");
      await page.getByRole("button", { name: "Edit" }).first().click();
      const sheet = page.getByRole("dialog", { name: "Edit profile" });
      await expect(sheet.getByLabel("Your name")).toHaveValue("Arjun R.");
      await expect(
        sheet.getByRole("group", { name: "Your sport" }).getByRole("button", { name: "Cricket" }),
      ).toHaveAttribute("aria-pressed", "true");
      expect(await smallTargets(page, '[role="dialog"]')).toEqual([]);
    });

    test("nothing clips or overlaps at 200 % text", async ({ page }) => {
      await page.goto("/dev/account");
      await scaleText(page);
      expect(await textProblems(page, "main")).toEqual([]);
    });
  });
}
