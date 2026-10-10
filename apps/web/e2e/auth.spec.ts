import { expect, test } from "@playwright/test";

/**
 * Phone OTP sign-in in a browser, against a real Supabase Auth with a test number.
 * Runs where E2E_AUTH=1 (CI's Supabase job, or locally with `pnpm supabase:up`);
 * E2E_AUTH_PHONE is a test number whose code is always E2E_AUTH_CODE.
 */
const phone = process.env["E2E_AUTH_PHONE"] ?? "9000000003";
const code = process.env["E2E_AUTH_CODE"] ?? "123456";

test.describe("sign-in", () => {
  test.skip(process.env["E2E_AUTH"] !== "1", "needs Supabase Auth (E2E_AUTH=1)");
  test.use({ viewport: { width: 390, height: 844 } });
  // One phone, so one at a time: Supabase Auth enforces a minimum gap between codes.
  test.describe.configure({ mode: "serial" });

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
});
