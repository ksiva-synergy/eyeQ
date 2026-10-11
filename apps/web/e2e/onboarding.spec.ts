import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { smallTargets } from "./touch-targets";

/**
 * Onboarding (plan phase 5, boards 1b to 1e) against a real Supabase Auth: a new athlete
 * signs in, sets up a profile with a name, rates a baseline, and is given the free Reset as
 * a starter (the cricket recommendation is shown second, as Pro). Runs where E2E_AUTH=1.
 */
const phone = process.env["E2E_ONBOARDING_PHONE"] ?? "9000000004";
const code = process.env["E2E_AUTH_CODE"] ?? "123456";

async function axe(page: Page) {
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
}

test.describe("onboarding", () => {
  test.skip(process.env["E2E_AUTH"] !== "1", "needs Supabase Auth (E2E_AUTH=1)");
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeAll(async () => {
    // Local reruns reuse the auth user; start it again as new. CI starts from an empty database.
    const db = new pg.Client({ connectionString: process.env["DATABASE_URL"] });
    await db.connect();
    try {
      await db.query(
        `update profiles set onboarded_at = null, dob = null, visibility = 'public'
         where id in (select id from auth.users where phone = $1)`,
        [`91${phone}`],
      );
      await db.query(
        "delete from self_ratings where user_id in (select id from auth.users where phone = $1)",
        [`91${phone}`],
      );
    } finally {
      await db.end();
    }
  });

  test("a new athlete signs in, sets up, rates a baseline and gets a starter", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByText("Step 1 of 4")).toBeVisible();
    expect(await smallTargets(page)).toEqual([]);
    await axe(page);
    await page.getByLabel("Phone number").fill(phone);
    await page.getByRole("button", { name: "Send code" }).click();
    await expect(page.getByRole("heading", { name: "Enter the code" })).toBeVisible();
    await page.getByLabel("Digit 1 of 6").fill(code);
    await page.getByRole("button", { name: "Verify and continue" }).click();

    // Step 2: profile, with the name field board 1c leaves out.
    await page.waitForURL("**/onboarding/profile");
    await expect(page.getByText("Step 2 of 4")).toBeVisible();
    expect(await smallTargets(page)).toEqual([]);
    await axe(page);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Add your name" })).toBeVisible();
    await page.getByLabel("Your name").fill("Meera K.");
    await page
      .getByRole("group", { name: "Your sport" })
      .getByRole("button", { name: "Cricket" })
      .click();
    await page
      .getByRole("group", { name: "Playing level" })
      .getByRole("button", { name: "Club" })
      .click();
    await page.getByLabel("Date of birth").fill("31 / 02 / 2001");
    await expect(page.getByText("Enter your date of birth as DD / MM / YYYY.")).toBeVisible();
    await page.getByLabel("Date of birth").fill("14 / 03 / 2001");
    await page
      .getByRole("group", { name: "Main goal" })
      .getByRole("button", { name: "Reaction speed" })
      .click();
    await page.getByRole("radio", { name: "15 min" }).click();
    await page.getByRole("button", { name: "Continue" }).click();

    // Step 3: baseline.
    await page.waitForURL("**/onboarding/baseline");
    await expect(page.getByText("Self-ratings track your training, nothing more.")).toBeVisible();
    await axe(page);
    await page.getByRole("button", { name: "Save baseline" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Rate all three" })).toBeVisible();
    for (const [area, n] of [
      ["Focus", 3],
      ["Reaction", 2],
      ["Tracking", 3],
    ] as const) {
      await page
        .getByRole("radiogroup", { name: `${area} rating` })
        .getByRole("radio", { name: `${n} of 5` })
        .click();
    }
    await page.getByRole("button", { name: "Save baseline" }).click();

    // Step 4: the starter is the free Reset; the cricket program is shown as Pro, second.
    await page.waitForURL("**/onboarding/starter");
    await expect(page.getByText("Recommended for cricket")).toBeVisible();
    const starter = page.getByRole("region", { name: "3-Day Eye Health Reset" });
    await expect(starter).toContainText("Free");
    await expect(starter).toContainText("4 drills / day");
    await expect(starter).toContainText("+65 XP / day");
    await expect(page.getByText("When you're ready")).toBeVisible();
    await expect(page.getByRole("link", { name: /Cricket Vision Foundations/ })).toContainText(
      "Included in Pro",
    );
    expect(await smallTargets(page)).toEqual([]);
    await axe(page);
    await page.getByRole("button", { name: "Go to Home instead" }).click();
    await page.waitForURL(/\/app$/);

    // What the server now holds.
    const me = await (await page.request.get("/api/v1/me")).json();
    expect(me).toMatchObject({
      displayName: "Meera K.",
      sport: "cricket",
      playingLevel: "club",
      goal: "reaction",
      isMinor: false,
      sessionMinutes: 15,
    });
    expect(me.onboardedAt).not.toBeNull();
    const progress = await (await page.request.get("/api/v1/progress")).json();
    expect(progress.ratings.baseline).toEqual({ focus: 3, reaction: 2, tracking: 3 });
    const home = await (await page.request.get("/api/v1/home")).json();
    expect(home.today).toMatchObject({
      kind: "program",
      programSlug: "eye-health-reset",
      dayNumber: 1,
    });
    expect(home.today.drills).toHaveLength(4);
  });
});
