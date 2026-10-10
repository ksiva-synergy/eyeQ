/**
 * Integration test against DATABASE_URL (run after `pnpm db:migrate`):
 * two concurrent coin spends cannot both succeed (plan 6.5).
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env["DATABASE_URL"];
const describeDb = url ? describe : describe.skip;

describeDb("concurrent coin spends", () => {
  const pool = new pg.Pool({ connectionString: url, max: 4 });
  let userId: string;

  beforeAll(async () => {
    const c = await pool.connect();
    try {
      await c.query("set role eyeq_owner");
      const r = await c.query<{ id: string }>(
        `insert into profiles (id, display_name, sport) values (gen_random_uuid(), 'Race', 'cricket') returning id`,
      );
      userId = r.rows[0]!.id;
      await c.query("select ensure_user_stats($1)", [userId]);
      await c.query("select earn_coins($1, 50, 'admin')", [userId]);
    } finally {
      c.release();
    }
  });

  afterAll(async () => {
    const c = await pool.connect();
    try {
      // ledgers are append-only; the profile row itself can go (seed data is unaffected)
      await c.query("set role eyeq_owner");
      await c.query("delete from coin_ledger where false");
    } finally {
      c.release();
    }
    await pool.end();
  });

  it("lets exactly one of two simultaneous 50-coin spends through", async () => {
    const spend = async () => {
      const c = await pool.connect();
      try {
        await c.query("begin");
        await c.query("set local role eyeq_owner");
        await c.query("select spend_coins($1, 50, 'spend_freeze')", [userId]);
        // hold the lock long enough for the other spend to queue behind it
        await c.query("select pg_sleep(0.3)");
        await c.query("commit");
        return "ok" as const;
      } catch (e) {
        await c.query("rollback");
        return (e as Error).message;
      } finally {
        c.release();
      }
    };
    const results = await Promise.all([spend(), spend()]);
    const ok = results.filter((r) => r === "ok");
    const failed = results.filter((r) => r !== "ok");
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatch(/insufficient_coins/);
    const c = await pool.connect();
    try {
      await c.query("set role eyeq_owner");
      const bal = await c.query<{ b: number }>("select coin_balance($1) as b", [userId]);
      expect(bal.rows[0]!.b).toBe(0);
    } finally {
      c.release();
    }
  });
});
