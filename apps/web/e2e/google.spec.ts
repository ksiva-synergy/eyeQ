import { expect, test } from "@playwright/test";

/**
 * Google sign-in (plan phase 2) as far as it can run without Google: against the local
 * Supabase Auth, EyeQ's two routes do their part of the PKCE flow. Completing a real
 * Google consent needs the OAuth client in Supabase's settings (the phase 2 gate) and is
 * checked by hand on staging. Runs where E2E_AUTH=1 (CI's Supabase job).
 */
test.describe("Google sign-in", () => {
  test.skip(process.env["E2E_AUTH"] !== "1", "needs Supabase Auth (E2E_AUTH=1)");

  test("the sign-in page's Google button starts the flow at /auth/google", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByRole("link", { name: "Continue with Google" })).toHaveAttribute(
      "href",
      "/auth/google",
    );
  });

  test("/auth/google sends the browser to Supabase's Google authorize URL with PKCE", async ({
    request,
  }) => {
    const res = await request.get("/auth/google", { maxRedirects: 0 });
    expect(res.status()).toBeGreaterThanOrEqual(300);
    expect(res.status()).toBeLessThan(400);
    const to = new URL(res.headers()["location"]!);
    expect(to.pathname).toBe("/auth/v1/authorize");
    expect(to.origin).toBe(new URL(process.env["SUPABASE_URL"]!).origin);
    expect(to.searchParams.get("provider")).toBe("google");
    expect(to.searchParams.get("redirect_to")).toMatch(/\/auth\/callback$/);
    expect(to.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(to.searchParams.get("code_challenge_method")?.toLowerCase()).toBe("s256");
    // The PKCE verifier stays on this site as a cookie, for the callback's exchange.
    const cookies = res
      .headersArray()
      .filter((h) => h.name.toLowerCase() === "set-cookie")
      .map((h) => h.value);
    expect(cookies.some((c) => /code-verifier=/.test(c))).toBe(true);
  });

  test("the callback refuses a missing or forged code and says Google did not finish", async ({
    request,
  }) => {
    for (const url of ["/auth/callback", "/auth/callback?code=forged-code"]) {
      const res = await request.get(url, { maxRedirects: 0 });
      expect(res.status(), url).toBeGreaterThanOrEqual(300);
      expect(
        new URL(res.headers()["location"]!).pathname + new URL(res.headers()["location"]!).search,
        url,
      ).toBe("/sign-in?error=google");
    }
  });

  test("sign-in shows the Google error when the callback sends it back", async ({ page }) => {
    await page.goto("/sign-in?error=google");
    await expect(
      page.getByRole("alert").filter({ hasText: "Google sign-in did not finish" }),
    ).toBeVisible();
  });
});
