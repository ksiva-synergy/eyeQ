import { expect, test } from "@playwright/test";

/** Outside production (CI and local have no APP_ENV=production): nothing is indexable. */
test("every response says noindex, and robots.txt disallows everything", async ({ request }) => {
  for (const path of ["/", "/sign-in", "/api/health", "/programs/no-such-program"]) {
    const res = await request.get(path);
    expect(res.headers()["x-robots-tag"], path).toBe("noindex, nofollow");
  }
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toBe("User-agent: *\nDisallow: /\n");
});
