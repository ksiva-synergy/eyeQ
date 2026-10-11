import { afterEach, describe, expect, it, vi } from "vitest";
import { qaCredentialsMatch, qaGrantFrom, qaTokenFrom, readQa, signQa, QA_TTL_S } from "./qa";

const cfg = { login: "shadow", password: "pw-1" };
const athlete = "00000000-0000-4000-8000-000000000001";

describe("QA master login", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("matches only the exact login and password", () => {
    expect(qaCredentialsMatch(cfg, "shadow", "pw-1")).toBe(true);
    expect(qaCredentialsMatch(cfg, "shadow", "pw-2")).toBe(false);
    expect(qaCredentialsMatch(cfg, "Shadow", "pw-1")).toBe(false);
    expect(qaCredentialsMatch(cfg, "", "")).toBe(false);
  });

  it("round-trips a grant and rejects tampering, other keys and expiry", () => {
    const now = Date.UTC(2026, 9, 11);
    const token = signQa(cfg, athlete, now);
    expect(readQa(cfg, token, now)).toEqual({ as: athlete, exp: now / 1000 + QA_TTL_S });
    expect(readQa(cfg, signQa(cfg, null, now), now)?.as).toBeNull();

    const [p, , sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ as: "someone-else", exp: 9e9 })).toString(
      "base64url",
    );
    expect(readQa(cfg, `${p}.${forged}.${sig}`, now)).toBeNull();
    expect(readQa({ ...cfg, password: "changed" }, token, now)).toBeNull();
    expect(readQa(cfg, token, now + QA_TTL_S * 1000)).toBeNull();
    expect(readQa(cfg, "garbage", now)).toBeNull();
  });

  it("reads a qa1 bearer token before the cookie, and ignores Supabase bearers", () => {
    const req = (h: Record<string, string>) => new Request("http://x/api/v1/me", { headers: h });
    expect(qaTokenFrom(req({ authorization: "Bearer qa1.a.b" }))).toBe("qa1.a.b");
    expect(qaTokenFrom(req({ authorization: "Bearer eyJ.x.y", cookie: "eyeq_qa=qa1.c.d" }))).toBe(
      "qa1.c.d",
    );
    expect(qaTokenFrom(req({}))).toBeNull();
  });

  it("is off without both values, and in production", () => {
    vi.stubEnv("QA_MASTER_LOGIN", cfg.login);
    vi.stubEnv("QA_MASTER_PASSWORD", cfg.password);
    const token = signQa(cfg, athlete);
    expect(qaGrantFrom(token)?.as).toBe(athlete);
    vi.stubEnv("APP_ENV", "production");
    expect(qaGrantFrom(token)).toBeNull();
    vi.stubEnv("APP_ENV", "staging");
    vi.stubEnv("QA_MASTER_PASSWORD", "");
    expect(qaGrantFrom(token)).toBeNull();
  });
});
