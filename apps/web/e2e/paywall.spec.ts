import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { scaleText, textProblems } from "./text-scale";
import { settled } from "./settle";
import { smallTargets } from "./touch-targets";

/**
 * The paywall (plan phase 7; board 11) from /dev/paywall at the seed's placeholder prices.
 * Buying signed in is checked against Razorpay test mode on staging (DECISIONS, phase 7);
 * the grant logic is covered by the webhook and purchases integration tests.
 */
async function axe(page: Page) {
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
}

for (const [width, height] of [
  [390, 844],
  [1440, 1000],
] as const) {
  test.describe(`Paywall at ${width} px`, () => {
    test.use({ viewport: { width, height } });

    test("plans, pay once, Free vs Pro, prices incl. GST, methods row", async ({ page }) => {
      await page.goto("/dev/paywall?program=1");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "Every program. Every drill.",
      );
      const plans = page.getByRole("radiogroup", { name: "Plan" });
      await expect(plans.getByRole("radio")).toHaveCount(3);
      await expect(plans).toContainText("Annual");
      await expect(plans).toContainText("₹2,499");
      await expect(plans).toContainText("₹208/month, billed yearly");
      await expect(plans).toContainText("Best value · save 30 %");
      await expect(plans).toContainText("₹799");
      await expect(plans).toContainText("₹299");
      // Opened from a program: that program, once, is preselected.
      const once = page.getByRole("radiogroup", { name: "Or pay once" });
      await expect(once.getByRole("radio")).toBeChecked();
      await expect(page.getByRole("button", { name: "Buy Reaction Edge · ₹1,299" })).toBeVisible();
      await plans.getByText("Monthly").click();
      await expect(page.getByRole("button", { name: "Start Pro · ₹299 / month" })).toBeVisible();

      const table = page.getByRole("table");
      await expect(table.getByRole("rowheader")).toHaveText([
        "Daily session + streaks",
        "3-Day Reset",
        "Leaderboards & weekly challenge",
        "All programs (3)",
        "Streak freezes",
      ]);
      await expect(table).toContainText("1 / week");
      await expect(page.getByText(/Prices in ₹, incl\. GST/)).toBeVisible();
      await expect(
        page.getByText("Training content, not medical advice or an eye exam."),
      ).toBeVisible();
      for (const m of ["UPI", "Card", "Net banking"])
        await expect(page.getByText(m, { exact: true })).toBeVisible();
      // What the plan removes from the board (8.2, D4, D6, D10).
      const text = await page.locator("body").innerText();
      expect(text).not.toMatch(/restore purchases|coach feedback|trial|coins|credits/i);
      expect(await smallTargets(page)).toEqual([]);
      await settled(page);
      await axe(page);
    });

    test("an athlete with Pro is told so, not sold it again", async ({ page }) => {
      await page.goto("/dev/paywall?pro=1");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("You have EyeQ Pro");
      await expect(page.getByRole("link", { name: "Open Purchases" })).toHaveAttribute(
        "href",
        "/app/account",
      );
      await expect(page.getByRole("radiogroup")).toHaveCount(0);
    });

    test("an invalid receipt email is caught before checkout", async ({ page }) => {
      await page.goto("/dev/paywall");
      await page.getByLabel("Email for your receipt").fill("not-an-email");
      await page.getByRole("button", { name: /^Start Pro/ }).click();
      await expect(page.getByText("Enter an email address, or leave it empty.")).toBeVisible();
    });

    test("nothing clips or overlaps at 200 % text", async ({ page }) => {
      await page.goto("/dev/paywall?program=1");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await scaleText(page);
      expect(await textProblems(page, "body")).toEqual([]);
    });
  });
}
