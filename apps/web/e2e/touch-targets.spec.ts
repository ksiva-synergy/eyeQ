import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { smallTargets } from "./touch-targets";

/**
 * Ground rule 13: 44 px targets. Admin inputs are drawn 40 tall and small buttons 36
 * (tokens size.input-admin, size.button-s) inside a 44 px hit area. The signed-in admin
 * pages are checked the same way in auth.spec.ts (Supabase job).
 */

test.describe("touch targets reach 44 px", () => {
  test("the check fails anything below 44 and accepts the hit-area classes", async ({ page }) => {
    await page.goto("/dev/admin-shell");
    await page.evaluate(() => {
      const box = document.createElement("div");
      box.id = "probe";
      box.style.cssText = "display:flex;flex-direction:column;gap:24px;padding:24px";
      box.innerHTML = [
        '<button style="height:43px;width:120px">short</button>',
        '<button style="height:44px;width:43px">narrow</button>',
        '<input aria-label="short field" style="height:43px">',
        '<button class="eyeq-hit" style="height:36px;width:120px">small with hit area</button>',
        '<button class="eyeq-hit" style="height:36px;width:36px">x</button>',
        '<input class="eyeq-hit-field" aria-label="admin field">',
        '<button style="height:44px;width:44px">ok</button>',
      ].join("");
      document.body.prepend(box);
    });
    const problems = await smallTargets(page, "#probe");
    expect(problems.map((p) => p.split(" drawn")[0])).toEqual([
      'button "short"',
      'button "narrow"',
      'input "short field"',
    ]);
  });

  for (const width of [390, 1440]) {
    test(`component gallery at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/dev/components");
      expect(await smallTargets(page, '[data-testid="gallery"]')).toEqual([]);
    });
  }

  test("admin shell", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/dev/admin-shell");
    expect(await smallTargets(page)).toEqual([]);
  });

  test.describe("program builder", () => {
    const program: unknown = JSON.parse(
      readFileSync(path.join(__dirname, "fixtures", "builder-program.json"), "utf8"),
    );

    test.beforeEach(async ({ page }) => {
      await page.route("**/api/admin/programs/*", (r) => r.fulfill({ json: program }));
      await page.route("**/api/admin/products", (r) => r.fulfill({ json: { products: [] } }));
      await page.route("**/api/admin/measurement-tags", (r) =>
        r.fulfill({
          json: { tags: [{ slug: "dva", name: "Dynamic Visual Acuity", group: "vision" }] },
        }),
      );
      await page.route("**/api/admin/drills*", (r) => r.fulfill({ json: { drills: [] } }));
    });

    for (const width of [390, 1440]) {
      test(`program settings, session and drill editors at ${width} px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto("/dev/builder");
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        const problems = await smallTargets(page, "main");
        await page.getByRole("button", { name: "Day 1 · Focus basics 4 drills · 14 min" }).click();
        problems.push(...(await smallTargets(page, "main")));
        await page.getByRole("button", { name: /^Near–Far Focus Shifts/ }).click();
        await expect(page.getByLabel("Drill name")).toBeVisible();
        problems.push(...(await smallTargets(page, "main")));
        expect([...new Set(problems)]).toEqual([]);
      });
    }
  });
});
