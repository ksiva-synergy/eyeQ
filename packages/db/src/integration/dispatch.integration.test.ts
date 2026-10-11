/**
 * The dispatcher's claim on two real connections (plan phase 6): two overlapping runs
 * never receive the same notification. Each claim holds its rows' locks until it commits
 * (SKIP LOCKED lets the other run pass them by), and a committed claim carries a lease
 * that keeps the rows from any run until it is finished or runs out.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { targetFor } from "../target.js";

const url =
  process.env["DIRECT_URL"] || process.env["DATABASE_URL"] ? targetFor("test") : undefined;
const describeDb = url ? describe : describe.skip;

describeDb("claim_notifications across connections", () => {
  const admin = new pg.Client({ connectionString: url });
  const runA = new pg.Client({ connectionString: url });
  const runB = new pg.Client({ connectionString: url });
  let userId: string;
  const at = "now() + interval '1 minute'";

  const claim = async (c: pg.Client, limit: number) => {
    const r = await c.query<{ v: { id: string; user_id: string }[] }>(
      `select claim_notifications($1, interval '2 minutes', ${at}) as v`,
      [limit],
    );
    return r.rows[0]!.v.filter((n) => n.user_id === userId).map((n) => n.id);
  };

  beforeAll(async () => {
    await Promise.all([admin.connect(), runA.connect(), runB.connect()]);
    for (const c of [runA, runB]) await c.query("set role eyeq_service");
    const u = await admin.query<{ id: string }>(
      "insert into auth.users (id) values (gen_random_uuid()) returning id",
    );
    userId = u.rows[0]!.id;
    await admin.query(
      "insert into profiles (id, display_name, timezone) values ($1, 'Dispatch race', 'Asia/Kolkata')",
      [userId],
    );
    await admin.query(
      `insert into notifications (user_id, kind, dedupe_key, local_date)
       select $1::uuid, 'daily_reminder', 'race-' || $1::text || '-' || g, date '2026-12-01' + g
       from generate_series(1, 40) g`,
      [userId],
    );
  });

  afterAll(async () => {
    await admin.query("delete from profiles where id = $1", [userId]);
    await admin.query("delete from auth.users where id = $1", [userId]);
    await Promise.all([admin.end(), runA.end(), runB.end()]);
  });

  it("two overlapping runs claim disjoint rows, and every row once", async () => {
    await runA.query("begin");
    await runB.query("begin");
    // A has claimed and not yet committed, so it still holds its rows' locks; B runs
    // inside that window and must pass them by.
    const a = await claim(runA, 25);
    const b = await claim(runB, 25);
    await Promise.all([runA.query("commit"), runB.query("commit")]);
    expect(a).toHaveLength(25);
    expect(b).toHaveLength(15);
    expect(new Set([...a, ...b]).size).toBe(40);
  });

  it("a third run inside the lease claims none of them", async () => {
    expect(await claim(runA, 50)).toEqual([]);
  });
});
