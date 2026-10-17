import { expect, test } from "@playwright/test";

/**
 * Google sign-in hidden unless AUTH_GOOGLE_ENABLED is on (staging until its OAuth client
 * exists). Runs where the flag is off: the main CI job and local runs. CI's Supabase job
 * turns it on for e2e/google.spec.ts.
 */
test.describe("Google sign-in, flag off", () => {
  test.skip(process.env["E2E_AUTH"] === "1", "the Supabase job runs with Google on");

  test("/sign-in offers no Google button", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Continue with Google" })).toHaveCount(0);
  });

  test("/auth/google goes back to sign-in instead of starting OAuth", async ({ request }) => {
    const res = await request.get("/auth/google", { maxRedirects: 0 });
    expect(res.status()).toBeGreaterThanOrEqual(300);
    expect(res.status()).toBeLessThan(400);
    expect(new URL(res.headers()["location"]!).pathname).toBe("/sign-in");
  });
});
