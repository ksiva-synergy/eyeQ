import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { scaleText, textProblems } from "./text-scale";
import { smallTargets } from "./touch-targets";

/**
 * The public program page (plan phase 7; board 15), signed out, against the seeded
 * Cricket Vision Foundations. Needs the database, so it runs where the seed is (CI's jobs
 * seed before Playwright); skipped when the page is not there.
 */
const URL = "/programs/cricket-vision-foundations";

for (const [width, height] of [
  [390, 844],
  [1280, 900],
] as const) {
  test.describe(`Program landing page at ${width} px`, () => {
    test.use({ viewport: { width, height } });

    test("server-rendered, with metadata, structured data and content-only claims", async ({
      page,
      request,
    }) => {
      const res = await request.get(URL);
      test.skip(res.status() !== 200, "needs the seeded database");
      const html = await res.text();
      // In the HTML itself, before any script runs (server-rendered for search).
      expect(html).toContain("Cricket Vision Foundations");
      expect(html).toContain('"@type":"Course"');
      expect(html).toContain('"priceCurrency":"INR"');
      await page.goto(URL);
      await expect(page).toHaveTitle(/Cricket Vision Foundations · EyeQ by Forge Your Peak/);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(/See the ball\s*earlier\./i);
      await expect(page.getByText("Test · Train · Transform")).toBeVisible();
      await expect(page.locator("#price")).toContainText("one-time · incl. GST");
      const text = await page.locator("body").innerText();
      // D15: no refund promise; D6: no trial; nothing the coach has not written.
      expect(text).not.toMatch(
        /money-back|refund|free in the app|trial|\[PRICE\]|\[NAME\]|TESTIMONIAL/i,
      );
      expect(await smallTargets(page)).toEqual([]);
      const axe = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(axe.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
    });

    test("buying signed out asks for the phone first (D16)", async ({ page, request }) => {
      test.skip((await request.get(URL)).status() !== 200, "needs the seeded database");
      await page.goto(`${URL}#price`);
      await page.getByRole("button", { name: /^Buy Cricket Vision Foundations · ₹/ }).click();
      await expect(page.getByLabel("Your phone number")).toBeVisible();
      await expect(page.getByRole("button", { name: "Send code" })).toBeVisible();
    });

    test("nothing clips or overlaps at 200 % text", async ({ page, request }) => {
      test.skip((await request.get(URL)).status() !== 200, "needs the seeded database");
      await page.goto(URL);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await scaleText(page);
      expect(await textProblems(page, "main")).toEqual([]);
    });
  });
}

// With cacheComponents the page streams, so a missing program is the not-found page with a
// 200 status; Next marks it noindex, which is what keeps it out of search (DECISIONS).
test("an unknown program is the not-found page, marked noindex", async ({ page }) => {
  await page.goto("/programs/no-such-program");
  await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);
  await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(/Cricket/);
});
