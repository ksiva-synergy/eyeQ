import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../app/robots.txt/route";
import { robotsHeaders, robotsTxt } from "./robots";

vi.mock("next/server", () => ({ connection: async () => {} }));

describe("search engines stay off everything but production", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("outside production: noindex on every response and a robots.txt that disallows all", () => {
    for (const env of ["staging", "local", "test", undefined, ""]) {
      expect(robotsHeaders(env)).toEqual([{ key: "X-Robots-Tag", value: "noindex, nofollow" }]);
      expect(robotsTxt(env)).toBe("User-agent: *\nDisallow: /\n");
    }
  });

  it("production: unchanged, no header and no robots.txt", () => {
    expect(robotsHeaders("production")).toEqual([]);
    expect(robotsTxt("production")).toBeNull();
  });

  it("/robots.txt answers by APP_ENV at request time", async () => {
    vi.stubEnv("APP_ENV", "staging");
    const staging = await GET();
    expect(staging.status).toBe(200);
    expect(await staging.text()).toBe("User-agent: *\nDisallow: /\n");
    vi.stubEnv("APP_ENV", "production");
    expect((await GET()).status).toBe(404);
  });
});
