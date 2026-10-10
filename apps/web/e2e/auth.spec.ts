import { expect, test, type Page } from "@playwright/test";
import pg from "pg";

/**
 * Phone OTP sign-in in a browser, against a real Supabase Auth with a test number.
 * Runs where E2E_AUTH=1 (CI's Supabase job, or locally with `pnpm supabase:up`);
 * E2E_AUTH_PHONE is a test number whose code is always E2E_AUTH_CODE.
 */
const phone = process.env["E2E_AUTH_PHONE"] ?? "9000000003";
const code = process.env["E2E_AUTH_CODE"] ?? "123456";

async function signIn(page: Page, path: string) {
  await page.goto(path);
  await page.waitForURL(/\/sign-in/);
  await page.getByLabel("Phone number").fill(phone);
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: "Verify and sign in" }).click();
}

test.describe("sign-in", () => {
  test.skip(process.env["E2E_AUTH"] !== "1", "needs Supabase Auth (E2E_AUTH=1)");
  test.use({ viewport: { width: 390, height: 844 } });
  // One phone, so one at a time: Supabase Auth enforces a minimum gap between codes.
  test.describe.configure({ mode: "serial" });
  // That gap is max_frequency in supabase/config.toml (1 s). A fast first test can end
  // inside it, so each test waits it out before asking for a code.
  test.beforeEach(async ({ page }) => {
    await page.waitForTimeout(1_100);
  });

  test("phone OTP signs in, shows the profile, and signs out", async ({ page }) => {
    await page.goto("/app");
    await page.waitForURL("**/sign-in");

    await page.getByLabel("Phone number").fill(phone);
    await page.getByRole("button", { name: "Send code" }).click();
    await page.getByLabel("6-digit code").fill(code);
    await page.getByRole("button", { name: "Verify and sign in" }).click();

    await page.waitForURL("**/app");
    await expect(page.getByText("Signed in as")).toBeVisible();
    await expect(page.getByText(/^\+91\d{10}$/)).toBeVisible();

    const me = await page.request.get("/api/v1/me");
    expect(me.status()).toBe(200);
    expect((await me.json()).phone).toMatch(/^\+91/);

    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL("**/sign-in");
    expect((await page.request.get("/api/v1/me")).status()).toBe(401);
  });

  test("a wrong code is refused with a message", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Phone number").fill(phone);
    await page.getByRole("button", { name: "Send code" }).click();
    await page.getByLabel("6-digit code").fill(code === "000000" ? "111111" : "000000");
    await page.getByRole("button", { name: "Verify and sign in" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "That code is not right" }),
    ).toBeVisible();
  });

  test("a coach reaches /admin and creates a product; an athlete does not", async ({ page }) => {
    await signIn(page, "/admin/products");
    await page.waitForURL("**/admin");
    // Signed in, no admins row yet: the admin area does not exist for this account.
    await expect(page.getByRole("heading", { level: 1 })).not.toHaveText("Products");
    expect((await page.request.get("/api/admin/products")).status()).toBe(403);

    const db = new pg.Client({ connectionString: process.env["DATABASE_URL"] });
    await db.connect();
    try {
      const u = await db.query<{ id: string }>("select id from auth.users where phone = $1", [
        `91${phone}`,
      ]);
      await db.query("select grant_admin_for($1, 'coach', 'script', null)", [u.rows[0]!.id]);
    } finally {
      await db.end();
    }

    await page.goto("/admin/products");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Products");
    await page.getByRole("button", { name: "New product" }).click();
    await page.getByLabel("Title").fill("E2E credit pack");
    await page.getByLabel("Kind").selectOption("credit_pack");
    await page.getByLabel("Price (₹, tax included)").fill("199");
    await page.getByLabel("Credits").fill("4");
    await page.getByRole("button", { name: "Create product" }).click();
    await expect(page.getByRole("cell", { name: /E2E credit pack/ })).toBeVisible();
    await expect(page.getByRole("cell", { name: "4 credits" }).first()).toBeVisible();
  });

  test("a coach finds an athlete, grants a program by hand, and it unlocks and is audited", async ({
    page,
  }) => {
    // Runs after the product test, so this account is already a coach. It is also the
    // athlete here: the only phone this job can sign in with.
    const db = new pg.Client({ connectionString: process.env["DATABASE_URL"] });
    await db.connect();
    try {
      const tag = crypto.randomUUID().slice(0, 8);
      const slug = `e2e-grant-${tag}`;
      const prog = await db.query<{ id: string }>(
        `insert into programs (slug, title, duration_days, is_free, in_subscription, status)
         values ($1, $2, 7, false, false, 'published') returning id`,
        [slug, `E2E grant ${tag}`],
      );
      const programId = prog.rows[0]!.id;
      const u = await db.query<{ id: string }>("select id from auth.users where phone = $1", [
        `91${phone}`,
      ]);
      const me = u.rows[0]!.id;

      await signIn(page, "/admin/athletes");
      await page.waitForURL("**/admin/athletes");
      await page.getByLabel("Search name or phone").fill(phone.slice(-4));
      await expect(page.getByText(`+91 ••••• •${phone.slice(-4)}`).first()).toBeVisible();
      expect(await page.content()).not.toContain(phone);

      const before = await page.request.get(`/api/v1/programs/${slug}`);
      expect((await before.json()).hasAccess).toBe(false);

      await page.goto(`/admin/athletes/${me}`);
      await page.getByRole("button", { name: "Grant access" }).click();
      const sheet = page.getByRole("dialog", { name: "Manual grant" });
      await sheet.getByRole("radio", { name: "Program" }).click();
      await sheet.getByLabel("Program, drill or challenge id").fill(programId);
      await sheet.getByLabel("Reason · kept in the audit log").fill("e2e comp");
      await sheet.getByRole("button", { name: "Grant", exact: true }).click();
      await expect(page.getByText(`Program · E2E grant ${tag}`)).toBeVisible();
      await expect(page.getByText("Manual grant · From", { exact: false }).first()).toBeVisible();

      const after = await page.request.get(`/api/v1/programs/${slug}`);
      expect((await after.json()).hasAccess).toBe(true);
      const audit = await db.query(
        `select a.actor_id from audit_log a join entitlements e on e.id::text = a.target_id
         where a.action = 'entitlement.grant' and e.scope_id = $1 and e.source = 'admin'`,
        [programId],
      );
      expect(audit.rows).toEqual([{ actor_id: me }]);
    } finally {
      await db.end();
    }
  });
});
