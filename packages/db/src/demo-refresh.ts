/**
 * `pnpm demo:refresh`: the demo athletes again, with activity ending yesterday (and eleven
 * of them trained today), so the coach demo shows full boards and live streaks however long
 * ago the seed ran. Local databases and the staging project only (an allow-list of
 * Supabase project refs); refused for production.
 *
 * Ledgers are append-only (rule 2), so nothing is re-dated: the current demo cohort is
 * retired (made private, so it leaves every board, renamed "Retired demo · …" and marked
 * `retired_at`, so the admin list hides it), and db/seed/athletes.sql lays the cohort down
 * again under fresh ids, through the same SQL the seed uses, ending with the cache
 * rebuilds. A retired athlete's sign-in (phone, email, the rest of its auth.users row and
 * its identities) moves to its new copy, so a test number attached to Arjun signs in as the
 * current Arjun. Each run is one transaction and writes an audit_log row naming the
 * athletes it made, in cohort order, which is how the next run finds them.
 *
 *   pnpm demo:refresh                     a local database
 *   GitHub Actions › Demo refresh         staging (workflow_dispatch, staging secrets)
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { adminUrl, isLocal } from "./target.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const SEED_DIR = path.resolve(here, "../../../db/seed");
/** Cricket Vision Foundations: present wherever the demo content was seeded. */
const DEMO_PROGRAM = "00000003-0000-4000-a000-000000000002";
export const RETIRED_PREFIX = "Retired demo · ";
/**
 * The only hosted databases demo:refresh may touch: Supabase project refs (public, in the
 * project's URL). Staging is the existing project (plan 2.4); production is never listed.
 */
export const DEMO_PROJECT_REFS = ["vqnronacubxhrzmtjemx"];

export type RefreshResult = { retired: string[]; athletes: string[]; movedSignIns: number };

/** A Supabase project ref from a direct (db.<ref>.supabase.co) or pooler URL (user postgres.<ref>). */
export function projectRef(url: string): string | null {
  const u = new URL(url);
  const direct = /^db\.([a-z0-9]+)\.supabase\.co$/.exec(u.hostname);
  if (direct) return direct[1]!;
  if (/\.pooler\.supabase\.com$/.test(u.hostname)) {
    const [, ref] = decodeURIComponent(u.username).split(".");
    return ref ?? null;
  }
  return null;
}

/** Refuses production, the transaction pooler, and any hosted database not on the allow-list. */
export function assertDemoTarget(url: string, env: NodeJS.ProcessEnv = process.env): void {
  if (env["NODE_ENV"] === "production" || env["APP_ENV"] === "production")
    throw new Error("demo:refresh refuses to run for production");
  const u = new URL(url);
  if (u.port === "6543")
    throw new Error("demo:refresh refuses the transaction pooler (port 6543); use port 5432");
  if (isLocal(url)) return;
  const ref = projectRef(url);
  if (!ref || !DEMO_PROJECT_REFS.includes(ref))
    throw new Error(
      `demo:refresh runs only on a local database or the staging project; ${u.hostname} is neither`,
    );
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

  // The live cohort, with each athlete's place n (1..24): the seed's (sid(1, n)), then each
  // earlier refresh's (its audit row lists them in order).
  const { rows: cohort } = await client.query<{ id: string; n: number }>(
    `with ids as (
       select (lpad('1', 8, '0') || '-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid as id, n
       from generate_series(1, 24) n
       union all
       select e.v::uuid, e.ord::integer from audit_log a,
         jsonb_array_elements_text(a.after->'athletes') with ordinality e (v, ord)
       where a.action = 'demo.refresh')
     select p.id, ids.n from profiles p join ids using (id)
     where p.retired_at is null and p.display_name not like $1 || '%'`,
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
    // Replaces the seed's uid() if this session defined one (same signature, new body).
    "drop function if exists pg_temp.uid(integer); create function pg_temp.uid(n integer) returns uuid language sql stable as $$ select d.id from pg_temp.demo_ids d where d.n = $1 $$",
  );

  await client.query("set local role eyeq_owner");
  if (retired.length)
    await client.query(
      `update profiles set visibility = 'private', display_name = $2 || display_name, retired_at = now()
       where id = any($1::uuid[])`,
      [retired, RETIRED_PREFIX],
    );
  await client.query(await readFile(path.join(SEED_DIR, "athletes.sql"), "utf8"));
  await client.query("reset role");

  const movedSignIns = await moveSignIns(client, cohort);

  await client.query("set local role eyeq_owner");
  const { rows } = await client.query<{ id: string }>(
    "select id from demo_ids where n <= 24 order by n",
  );
  const athletes = rows.map((r) => r.id);
  await client.query(
    `insert into audit_log (actor_role, action, target_type, after)
     values ('script', 'demo.refresh', 'demo',
             jsonb_build_object('athletes', $1::jsonb, 'retired', $2::jsonb, 'moved_sign_ins', $3::integer))`,
    [JSON.stringify(athletes), JSON.stringify(retired), movedSignIns],
  );
  await client.query("reset role"); // hand the connection back as it came
  return { retired, athletes, movedSignIns };
}

/**
 * A retired athlete that can sign in (a phone or an email on its auth user) hands that
 * sign-in to its new copy: every column of its auth.users row except the id and creation
 * time (on Supabase that includes the confirmation and audience fields sign-in needs), and
 * its identities. The old user keeps neither phone nor email, so it can no longer sign in.
 * Runs as the admin role; auth belongs to it, not to eyeq_owner.
 */
/** Supabase Auth's pending-code columns (strings it never reads as null), and their times. */
const TOKEN_TEXT = [
  "confirmation_token",
  "recovery_token",
  "email_change_token_new",
  "email_change_token_current",
  "email_change",
  "phone_change",
  "phone_change_token",
  "reauthentication_token",
];
const TOKEN_TIMES = [
  "confirmation_sent_at",
  "recovery_sent_at",
  "email_change_sent_at",
  "phone_change_sent_at",
  "reauthentication_sent_at",
];

async function moveSignIns(
  client: pg.Client,
  cohort: { id: string; n: number }[],
): Promise<number> {
  if (!cohort.length) return 0;
  const { rows: cols } = await client.query<{ c: string }>(
    `select column_name as c from information_schema.columns
     where table_schema = 'auth' and table_name = 'users'
       and column_name not in ('id', 'created_at') and is_generated = 'NEVER' and is_identity = 'NO'
     order by ordinal_position`,
  );
  // Pending one-time codes are not part of a sign-in: they are left empty on both users
  // (Supabase Auth reads them as strings), and the old user's one_time_tokens are dropped.
  // Supabase Auth finds a pending code by the phone it relates to: left on the old user, it
  // made the next code request for that phone fail (500).
  const pending = new Set([...TOKEN_TEXT, ...TOKEN_TIMES]);
  const set = cols
    .filter(({ c }) => !pending.has(c))
    .map(({ c }) => `${pg.escapeIdentifier(c)} = o.${pg.escapeIdentifier(c)}`)
    .join(", ");
  const present = new Set(cols.map(({ c }) => c));
  const clear = [
    ...TOKEN_TEXT.filter((c) => present.has(c)).map((c) => `${pg.escapeIdentifier(c)} = ''`),
    ...TOKEN_TIMES.filter((c) => present.has(c)).map((c) => `${pg.escapeIdentifier(c)} = null`),
  ].join(", ");
  const oneTimeTokens = await client.query(
    "select to_regclass('auth.one_time_tokens') is not null as ok",
  );
  const identities = await client.query("select to_regclass('auth.identities') is not null as ok");
  let moved = 0;
  for (const { id: from, n } of cohort) {
    const { rows } = await client.query<{ to: string }>(
      `select d.id as "to" from pg_temp.demo_ids d, auth.users u
       where d.n = $2 and u.id = $1 and (u.phone is not null or u.email is not null)`,
      [from, n],
    );
    const to = rows[0]?.to;
    if (!to) continue;
    await client.query("drop table if exists pg_temp.moving_user");
    await client.query(
      "create temp table moving_user on commit drop as select * from auth.users where id = $1",
      [from],
    );
    // Phone and email are unique: free them on the old user before the copy takes them.
    await client.query("update auth.users set phone = null, email = null where id = $1", [from]);
    await client.query(
      `update auth.users u set ${set} from pg_temp.moving_user o where u.id = $1`,
      [to],
    );
    if (clear)
      await client.query(`update auth.users set ${clear} where id = any($1::uuid[])`, [[from, to]]);
    if (oneTimeTokens.rows[0]?.ok)
      await client.query("delete from auth.one_time_tokens where user_id = $1::uuid", [from]);
    if (identities.rows[0]?.ok)
      await client.query(
        // $1/$2 are the ids as uuids, $3/$4 the same ids as text: one type per parameter.
        `update auth.identities set user_id = $2::uuid,
           provider_id = case when provider_id = $3::text then $4::text else provider_id end,
           identity_data = case when identity_data->>'sub' = $3::text
                                then jsonb_set(identity_data, '{sub}', to_jsonb($4::text)) else identity_data end
         where user_id = $1::uuid`,
        [from, to, from, to],
      );
    moved++;
  }
  return moved;
}

async function main() {
  const url = adminUrl();
  assertDemoTarget(url);
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("begin");
    const r = await refreshDemo(client);
    await client.query("commit");
    console.log(
      `demo refreshed: ${r.athletes.length} athletes with activity ending yesterday; ${r.retired.length} retired (private, hidden from the admin list); ${r.movedSignIns} sign-in(s) moved to the new copies`,
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
