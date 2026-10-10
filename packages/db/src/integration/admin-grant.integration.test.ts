/** pnpm admin:grant against a real database: finds the auth user by phone, writes audit_log. */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminGrant, phoneDigits } from "../admin-grant.ts";
import { targetFor } from "../target.js";

const url =
  process.env["DIRECT_URL"] || process.env["DATABASE_URL"] ? targetFor("test") : undefined;
const describeDb = url ? describe : describe.skip;

describe("phoneDigits", () => {
  it("normalises to Supabase's stored form", () => {
    expect(phoneDigits("98765 43210")).toBe("919876543210");
    expect(phoneDigits("+91 98765-43210")).toBe("919876543210");
    expect(() => phoneDigits("12")).toThrow();
  });
});

describeDb("pnpm admin:grant", () => {
  const admin = new pg.Client({ connectionString: url });
  const phone = `9${String(Date.now()).slice(-9)}`;
  let userId: string;

  beforeAll(async () => {
    await admin.connect();
    const r = await admin.query<{ id: string }>(
      "insert into auth.users (id, phone) values (gen_random_uuid(), $1) returning id",
      [`91${phone}`],
    );
    userId = r.rows[0]!.id;
  });
  afterAll(() => admin.end());

  it("makes a signed-in phone user an owner and audits it", async () => {
    const r = await adminGrant(url!, phone, "owner");
    expect(r.userId).toBe(userId);
    const a = await admin.query("select role from admins where user_id = $1", [userId]);
    expect(a.rows[0]?.role).toBe("owner");
    const log = await admin.query("select actor_role, action from audit_log where target_id = $1", [
      userId,
    ]);
    expect(log.rows).toEqual([{ actor_role: "script", action: "admin.grant" }]);
  });

  it("refuses a phone that never signed in, and a bad role", async () => {
    await expect(adminGrant(url!, "9000099999", "coach")).rejects.toThrow(/sign in once/);
    await expect(adminGrant(url!, phone, "admin")).rejects.toThrow(/coach or owner/);
  });
});
