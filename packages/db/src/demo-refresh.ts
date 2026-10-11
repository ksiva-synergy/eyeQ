/**
 * `pnpm demo:refresh`: the demo athletes again, with activity ending yesterday (and eleven
 * of them trained today), so the coach demo shows full boards and live streaks however long
 * ago the seed ran. Staging and local only; refused on production.
 *
 * Ledgers are append-only (rule 2), so nothing is re-dated: the current demo cohort is
 * retired (made private, so it leaves every board, and renamed "Retired demo · …"), and
 * db/seed/athletes.sql lays the cohort down again under fresh ids, through the same SQL the
 * seed uses, ending with the cache rebuilds. Each run is one transaction and writes an
 * audit_log row naming the athletes it made, which is how the next run finds them.
 *
 *   pnpm demo:refresh                         local database
 *   ALLOW_REMOTE_SEED=1 pnpm demo:refresh     staging (the session pooler or direct URL)
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { targetFor } from "./target.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const SEED_DIR = path.resolve(here, "../../../db/seed");
/** Cricket Vision Foundations: present wherever the demo content was seeded. */
const DEMO_PROGRAM = "00000003-0000-4000-a000-000000000002";
export const RETIRED_PREFIX = "Retired demo · ";

export type RefreshResult = { retired: string[]; athletes: string[] };

/** Refuses anywhere that is not a demo environment. */
export function assertDemoEnvironment(env: NodeJS.ProcessEnv = process.env): void {
  if (env["NODE_ENV"] === "production" || env["APP_ENV"] === "production")
    throw new Error("demo:refresh refuses to run for production");
}

/**
 * Runs inside the caller's transaction, connected as the admin role (it steps into
 * eyeq_owner, and out of it for auth.users, as the seed does).
 */
export async function refreshDemo(client: pg.Client): Promise<RefreshResult> {
  const content = await client.query("select 1 from programs where id = $1", [DEMO_PROGRAM]);
  if (!content.rowCount)
    throw new Error(
      "no demo content in this database: demo:refresh runs only where the demo was seeded",
    );

  // The cohort: the seed's athletes (sid(1, 1..24)) and every earlier refresh's.
  const { rows: cohort } = await client.query<{ id: string }>(
    `with ids as (
       select (lpad('1', 8, '0') || '-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid as id
       from generate_series(1, 24) n
       union
       select jsonb_array_elements_text(after->'athletes')::uuid from audit_log where action = 'demo.refresh')
     select p.id from profiles p join ids using (id) where p.display_name not like $1 || '%'`,
    [RETIRED_PREFIX],
  );
  const retired = cohort.map((r) => r.id);

  // Fresh ids for athletes 1..24 and Arjun's enrolment (901), readable by both roles the
  // athletes SQL runs as (the admin role for auth.users, eyeq_owner for the rest).
  await client.query("drop table if exists pg_temp.demo_ids");
  await client.query(
    `create temp table demo_ids on commit drop as
     select n, gen_random_uuid() as id from (select generate_series(1, 24) as n union all select 901) s`,
  );
  await client.query("grant select on demo_ids to eyeq_owner");
  await client.query(
    "create or replace function pg_temp.sid(kind integer, n integer) returns uuid language sql immutable as $$ select (lpad(kind::text, 8, '0') || '-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid $$",
  );
  await client.query(
    "create or replace function pg_temp.uid(k integer) returns uuid language sql stable as $$ select id from pg_temp.demo_ids where n = k $$",
  );

  await client.query("set local role eyeq_owner");
  if (retired.length)
    await client.query(
      `update profiles set visibility = 'private', display_name = $2 || display_name
       where id = any($1::uuid[])`,
      [retired, RETIRED_PREFIX],
    );
  await client.query(await readFile(path.join(SEED_DIR, "athletes.sql"), "utf8"));
  await client.query("set local role eyeq_owner");

  const { rows } = await client.query<{ id: string }>(
    "select id from demo_ids where n <= 24 order by n",
  );
  const athletes = rows.map((r) => r.id);
  await client.query(
    `insert into audit_log (actor_role, action, target_type, after)
     values ('script', 'demo.refresh', 'demo', jsonb_build_object('athletes', $1::jsonb, 'retired', $2::jsonb))`,
    [JSON.stringify(athletes), JSON.stringify(retired)],
  );
  await client.query("reset role"); // hand the connection back as it came
  return { retired, athletes };
}

async function main() {
  assertDemoEnvironment();
  const url = targetFor("seed"); // local, or remote with ALLOW_REMOTE_SEED=1 for this run
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("begin");
    const r = await refreshDemo(client);
    await client.query("commit");
    console.log(
      `demo refreshed: ${r.athletes.length} athletes with activity ending yesterday; ${r.retired.length} retired (private, renamed "${RETIRED_PREFIX}…")`,
    );
  } catch (e) {
    await client.query("rollback").catch(() => undefined);
    throw e;
  } finally {
    await client.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
