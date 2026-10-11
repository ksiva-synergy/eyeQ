/**
 * `pnpm demo:refresh` against a real database, in one transaction that is rolled back:
 * no existing ledger row changes (rule 2), the old cohort leaves the boards, the new one
 * reproduces the demo (Arjun R. at 2,040 XP, 412 this week, 140 coins, his run ending
 * yesterday), and every cache equals its rebuild (rule 3). A second run retires the first
 * run's cohort. Where the demo is not seeded yet (CI seeds after these tests), it is
 * seeded inside the same transaction first.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertDemoEnvironment, refreshDemo, RETIRED_PREFIX } from "../demo-refresh.ts";
import { seedConfig } from "../seed.ts";
import { targetFor } from "../target.js";

const url =
  process.env["DIRECT_URL"] || process.env["DATABASE_URL"] ? targetFor("test") : undefined;
const describeDb = url ? describe : describe.skip;
const SEED_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../db/seed");
const LEDGERS = [
  "xp_ledger",
  "coin_ledger",
  "freeze_ledger",
  "credit_ledger",
  "entitlement_events",
  "audit_log",
];

describe("demo:refresh refuses production", () => {
  it("refuses NODE_ENV or APP_ENV production", () => {
    expect(() => assertDemoEnvironment({ NODE_ENV: "production" })).toThrow(/production/);
    expect(() => assertDemoEnvironment({ APP_ENV: "production" })).toThrow(/production/);
    expect(() => assertDemoEnvironment({ APP_ENV: "staging" })).not.toThrow();
  });
});

describeDb("demo:refresh", () => {
  const c = new pg.Client({ connectionString: url });

  /**
   * One fingerprint per ledger over the rows that existed when `snapshot` ran (their ids
   * are kept in a temp table), so added rows do not count and a changed row does.
   */
  async function ledgerPrints(snapshot: boolean) {
    const out: Record<string, string> = {};
    for (const t of LEDGERS) {
      if (snapshot)
        await c.query(
          `create temp table if not exists before_${t} on commit drop as select id from ${t}`,
        );
      const r = await c.query<{ p: string | null; n: number }>(
        `select md5(string_agg(x::text, '|' order by x.id)) as p, count(*)::int as n
         from ${t} x where x.id in (select id from before_${t})`,
      );
      out[t] = `${r.rows[0]!.n}:${r.rows[0]!.p}`;
    }
    return out;
  }

  /** Caches equal their rebuild: user_stats per athlete, and the current week's boards. */
  async function cachesMatchRebuilds(athletes: string[]) {
    for (const id of athletes) {
      const before = await c.query(
        "select total_xp, level, coins, freezes_held, current_streak, best_streak from user_stats where user_id = $1",
        [id],
      );
      await c.query("select rebuild_user_stats($1)", [id]);
      const after = await c.query(
        "select total_xp, level, coins, freezes_held, current_streak, best_streak from user_stats where user_id = $1",
        [id],
      );
      expect(after.rows, `user_stats of ${id}`).toEqual(before.rows);
    }
    const board = `select week_start, scope, scope_value, user_id, xp, rank, is_public from leaderboard_weekly
                   where week_start = ist_week_start(now()) order by scope, scope_value, user_id`;
    const before = await c.query(board);
    await c.query("select rebuild_leaderboards()");
    const after = await c.query(board);
    expect(after.rows).toEqual(before.rows);
  }

  beforeAll(async () => {
    await c.connect();
    await c.query("begin");
    const seeded = await c.query(
      "select 1 from programs where id = '00000003-0000-4000-a000-000000000002'",
    );
    if (!seeded.rowCount) {
      await c.query("set local role eyeq_owner");
      await seedConfig(c);
      await c.query(await readFile(path.join(SEED_DIR, "seed.sql"), "utf8"));
      await c.query(
        "create or replace function pg_temp.uid(n integer) returns uuid language sql immutable as $$ select pg_temp.sid(1, n) $$",
      );
      await c.query(await readFile(path.join(SEED_DIR, "athletes.sql"), "utf8"));
      await c.query("reset role");
    }
  });

  afterAll(async () => {
    await c.query("rollback");
    await c.end();
  });

  it("lays the demo down again without touching a ledger row, and every cache equals its rebuild", async () => {
    const printsBefore = await ledgerPrints(true);
    const board = await c.query<{ user_id: string }>(
      "select user_id from leaderboard_weekly where week_start = ist_week_start(now()) and scope = 'global' and is_public",
    );

    const r = await refreshDemo(c);
    expect(r.athletes).toHaveLength(24);
    expect(r.retired.length).toBeGreaterThan(0);

    // Rule 2: every ledger row that existed is byte-for-byte unchanged; only new rows were added.
    const printsAfter = await ledgerPrints(false);
    expect(printsAfter).toEqual(printsBefore);

    // The old cohort is off the boards and renamed; the new Arjun is the demo's Arjun.
    const old = await c.query<{ display_name: string; visibility: string }>(
      "select display_name, visibility from profiles where id = any($1::uuid[])",
      [r.retired],
    );
    expect(
      old.rows.every(
        (p) => p.display_name.startsWith(RETIRED_PREFIX) && p.visibility === "private",
      ),
    ).toBe(true);
    const publicNow = await c.query<{ user_id: string }>(
      "select user_id from leaderboard_weekly where week_start = ist_week_start(now()) and scope = 'global' and is_public",
    );
    const ids = new Set(publicNow.rows.map((x) => x.user_id));
    for (const id of r.retired) expect(ids.has(id)).toBe(false);
    expect(publicNow.rows.length).toBeGreaterThanOrEqual(
      board.rows.filter((x) => !r.retired.includes(x.user_id)).length,
    );

    const arjun = r.athletes[0]!;
    const a = await c.query(
      `select p.display_name, s.total_xp, s.coins, s.level, s.current_streak,
              (select xp from leaderboard_weekly l where l.user_id = p.id and l.scope = 'global' and l.week_start = ist_week_start(now())) as week_xp,
              (select max(local_date) from session_completions sc where sc.user_id = p.id) = local_date(now(), 'Asia/Kolkata') - 1 as ends_yesterday
       from profiles p join user_stats s on s.user_id = p.id where p.id = $1`,
      [arjun],
    );
    expect(a.rows[0]).toMatchObject({
      display_name: "Arjun R.",
      total_xp: 2040,
      coins: 140,
      level: 7,
      week_xp: 412,
      ends_yesterday: true,
    });
    expect(a.rows[0].current_streak).toBeGreaterThanOrEqual(12);

    await cachesMatchRebuilds([...r.athletes, ...r.retired]);
  });

  it("a second run retires the first run's athletes, found through the audit log", async () => {
    const first = await c.query<{ ids: string[] }>(
      "select array(select jsonb_array_elements_text(after->'athletes')) as ids from audit_log where action = 'demo.refresh' order by created_at desc limit 1",
    );
    const r = await refreshDemo(c);
    expect(r.retired.sort()).toEqual([...first.rows[0]!.ids].sort());
    await cachesMatchRebuilds(r.athletes);
  });
});
