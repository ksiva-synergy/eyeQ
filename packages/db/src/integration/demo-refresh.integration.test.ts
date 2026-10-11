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
import { assertDemoTarget, projectRef, refreshDemo, RETIRED_PREFIX } from "../demo-refresh.ts";
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

describe("demo:refresh runs only locally or on the staging project", () => {
  const staging = "vqnronacubxhrzmtjemx";
  const pooler = (ref: string, port = 5432) =>
    `postgresql://postgres.${ref}:pw@aws-1-ap-south-1.pooler.supabase.com:${port}/postgres`;
  it("reads the project ref from a direct or a pooler URL", () => {
    expect(projectRef(`postgresql://postgres:pw@db.${staging}.supabase.co:5432/postgres`)).toBe(
      staging,
    );
    expect(projectRef(pooler(staging))).toBe(staging);
    expect(projectRef("postgres://postgres:postgres@localhost:5432/eyeq")).toBeNull();
  });
  it("allows a local database and the staging project", () => {
    expect(() =>
      assertDemoTarget("postgres://postgres:postgres@localhost:5432/eyeq", {}),
    ).not.toThrow();
    expect(() => assertDemoTarget(pooler(staging), {})).not.toThrow();
    expect(() =>
      assertDemoTarget(`postgresql://postgres:pw@db.${staging}.supabase.co:5432/postgres`, {}),
    ).not.toThrow();
  });
  it("refuses any other project, the transaction pooler, and production", () => {
    expect(() => assertDemoTarget(pooler("abcdefghijklmnopqrst"), {})).toThrow(/staging project/);
    expect(() => assertDemoTarget("postgresql://u:p@db.example.com:5432/x", {})).toThrow(
      /staging project/,
    );
    expect(() => assertDemoTarget(pooler(staging, 6543), {})).toThrow(/6543/);
    expect(() => assertDemoTarget(pooler(staging), { APP_ENV: "production" })).toThrow(
      /production/,
    );
    expect(() =>
      assertDemoTarget("postgres://postgres:postgres@localhost:5432/eyeq", {
        NODE_ENV: "production",
      }),
    ).toThrow(/production/);
  });
});

describeDb("demo:refresh", () => {
  const c = new pg.Client({ connectionString: url });
  /** The latest refresh in this transaction (audit rows share one now(), so not by time). */
  let previous: Awaited<ReturnType<typeof refreshDemo>> | undefined;

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

  it("a phone and email on Arjun move to the new Arjun, so his test number signs in as the current one", async () => {
    const current = await c.query<{ id: string }>(
      "select p.id from profiles p where p.display_name = 'Arjun R.' and p.retired_at is null order by p.created_at desc limit 1",
    );
    const oldArjun = current.rows[0]!.id;
    const phone = "919000099991";
    const email = "arjun-demo@example.com";
    await c.query("update auth.users set phone = null where phone = $1", [phone]);
    await c.query("update auth.users set phone = $2, email = $3 where id = $1", [
      oldArjun,
      phone,
      email,
    ]);
    const identities = (await c.query("select to_regclass('auth.identities') is not null as ok"))
      .rows[0].ok as boolean;
    if (identities)
      await c.query(
        `insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
         values ($1::text, $1::uuid, jsonb_build_object('sub', $1::text, 'phone', $2::text), 'phone', now(), now())`,
        [oldArjun, phone],
      );

    const r = await refreshDemo(c);
    previous = r;
    expect(r.retired).toContain(oldArjun);
    expect(r.movedSignIns).toBeGreaterThanOrEqual(1);
    const newArjun = r.athletes[0]!;
    const owner = await c.query("select id, email from auth.users where phone = $1", [phone]);
    expect(owner.rows).toEqual([{ id: newArjun, email }]);
    const old = await c.query("select phone, email from auth.users where id = $1", [oldArjun]);
    expect(old.rows[0]).toEqual({ phone: null, email: null });
    if (identities) {
      const idn = await c.query(
        "select user_id, provider_id, identity_data->>'sub' as sub from auth.identities where provider = 'phone' and identity_data->>'phone' = $1",
        [phone],
      );
      expect(idn.rows).toEqual([{ user_id: newArjun, provider_id: newArjun, sub: newArjun }]);
    }
    const name = await c.query("select display_name from profiles where id = $1", [newArjun]);
    expect(name.rows[0].display_name).toBe("Arjun R.");
  });

  it("the admin athlete list leaves retired demo athletes out unless asked", async () => {
    const retired = await c.query<{ id: string }>(
      "select id from profiles where retired_at is not null",
    );
    expect(retired.rowCount).toBeGreaterThan(0);
    const ids = (v: { athletes: { id: string }[] }) => new Set(v.athletes.map((a) => a.id));
    const def = await c.query("select admin_athletes_for(null, null, 0, 0) as v");
    const all = await c.query("select admin_athletes_for(null, null, 0, 0, now(), true) as v");
    for (const { id } of retired.rows) {
      expect(ids(def.rows[0].v).has(id)).toBe(false);
      expect(ids(all.rows[0].v).has(id)).toBe(true);
    }
    expect(all.rows[0].v.total - def.rows[0].v.total).toBe(retired.rowCount);
  });

  it("this week's XP is placed inside this week, never in the future, on any weekday", async () => {
    const r = await c.query(
      `select count(*)::int as n,
              count(*) filter (where created_at < local_day_start(ist_week_start(now()), 'Asia/Kolkata') or created_at > now())::int as outside
       from xp_ledger where reason = 'admin' and user_id in (select id from profiles where retired_at is null)
         and created_at >= local_day_start(ist_week_start(now()), 'Asia/Kolkata') - interval '1 minute'`,
    );
    expect(r.rows[0].n).toBeGreaterThan(20);
    expect(r.rows[0].outside).toBe(0);
    const trained = await c.query(
      `select count(*)::int as n from session_completions
       where local_date = local_date(now(), 'Asia/Kolkata') and local_date(completed_at, 'Asia/Kolkata') <> local_date
         and user_id in (select id from profiles where retired_at is null)`,
    );
    expect(trained.rows[0].n).toBe(0);
  });

  it("a second run retires the previous run's athletes, found through the audit log", async () => {
    const r = await refreshDemo(c);
    expect([...r.retired].sort()).toEqual([...previous!.athletes].sort());
    await cachesMatchRebuilds(r.athletes);
  });
});
