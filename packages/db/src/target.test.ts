import { describe, expect, it } from "vitest";
import { adminUrl, assertTarget, targetFor } from "./target.js";

const LOCAL = "postgres://postgres:postgres@localhost:5432/eyeq";
const SESSION = "postgresql://postgres.ref:pw@aws-0-ap-south-1.pooler.supabase.com:5432/postgres";
const TXN = "postgresql://postgres.ref:pw@aws-0-ap-south-1.pooler.supabase.com:6543/postgres";

describe("admin database target", () => {
  it("prefers DIRECT_URL over DATABASE_URL", () => {
    expect(adminUrl({ DATABASE_URL: TXN, DIRECT_URL: SESSION })).toBe(SESSION);
    expect(adminUrl({ DATABASE_URL: LOCAL })).toBe(LOCAL);
    expect(() => adminUrl({})).toThrow(/not set/);
  });

  it("allows everything locally", () => {
    for (const a of ["migrate", "status", "reset", "test", "seed"] as const) {
      expect(() => assertTarget(a, LOCAL, {})).not.toThrow();
    }
    expect(() =>
      assertTarget("reset", "postgresql://postgres:postgres@127.0.0.1:55322/postgres", {}),
    ).not.toThrow();
  });

  it("never resets or tests a remote database", () => {
    expect(() => assertTarget("reset", SESSION, { ALLOW_REMOTE_SEED: "1" })).toThrow(/non-local/);
    expect(() => assertTarget("test", SESSION, {})).toThrow(/non-local/);
  });

  it("seeds a remote database only when asked for that run", () => {
    expect(() => assertTarget("seed", SESSION, {})).toThrow(/ALLOW_REMOTE_SEED/);
    expect(() => assertTarget("seed", SESSION, { ALLOW_REMOTE_SEED: "1" })).not.toThrow();
  });

  it("migrates a remote database but never through the transaction pooler", () => {
    expect(() => assertTarget("migrate", SESSION, {})).not.toThrow();
    expect(() => assertTarget("migrate", TXN, {})).toThrow(/6543/);
  });

  it("checks the URL it resolves", () => {
    expect(() => targetFor("reset", { DATABASE_URL: LOCAL, DIRECT_URL: SESSION })).toThrow(
      /non-local/,
    );
  });
});
