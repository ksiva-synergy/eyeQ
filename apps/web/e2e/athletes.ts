import type { Page } from "@playwright/test";
import pg from "pg";

/**
 * Signed-in e2e helpers shared by the acceptance specs (phases 5 and 6): the seed's Arjun,
 * sign-in with a Supabase test number, and an exact copy of Arjun under a new id. Test
 * data only, on the local stack (CI's Supabase job).
 */
export const code = process.env["E2E_AUTH_CODE"] ?? "123456";
export const ARJUN = "00000001-0000-4000-a000-000000000001";

export async function withDb<T>(fn: (db: pg.Client) => Promise<T>): Promise<T> {
  const db = new pg.Client({ connectionString: process.env["DATABASE_URL"] });
  await db.connect();
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}

export async function signIn(page: Page, phone: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("Digit 1 of 6").fill(code);
  await page.getByRole("button", { name: "Verify and continue" }).click();
}

/** Supabase Auth reads these as strings; the seed's auth rows (id only) leave them null. */
export const AUTH_READY = `phone_confirmed_at = now(), aud = 'authenticated', role = 'authenticated',
  instance_id = '00000000-0000-0000-0000-000000000000',
  raw_app_meta_data = '{"provider":"phone","providers":["phone"]}', raw_user_meta_data = '{}',
  created_at = coalesce(created_at, now()), updated_at = now(),
  confirmation_token = coalesce(confirmation_token, ''), recovery_token = coalesce(recovery_token, ''),
  email_change_token_new = coalesce(email_change_token_new, ''), email_change = coalesce(email_change, ''),
  email_change_token_current = coalesce(email_change_token_current, ''),
  phone_change = coalesce(phone_change, ''), phone_change_token = coalesce(phone_change_token, ''),
  reauthentication_token = coalesce(reauthentication_token, '')`;

/**
 * A copy of seeded Arjun, row for row, under a new id: his profile, enrolment, sessions,
 * drills, ledgers, badges, ratings and challenge progress, his Pro, and user_stats rebuilt
 * from the ledgers. Test data only, on the local stack.
 */
export async function cloneArjun(db: pg.Client, to: string, phone: string) {
  await db.query("update auth.users set phone = null where phone = $1 and id <> $2", [phone, to]);
  const exists = await db.query("select 1 from profiles where id = $1", [to]);
  if (exists.rowCount) return;
  await db.query("insert into auth.users (id, phone) values ($1, $2)", [to, phone]);
  await db.query(`update auth.users set ${AUTH_READY} where id = $1`, [to]);
  await db.query(
    `insert into profiles select (jsonb_populate_record(null::profiles, to_jsonb(p) || jsonb_build_object('id', $2::uuid))).*
     from profiles p where id = $1`,
    [ARJUN, to],
  );
  for (const table of [
    "enrollments",
    "session_completions",
    "drill_completions",
    "xp_ledger",
    "coin_ledger",
    "freeze_ledger",
    "user_badges",
    "self_ratings",
    "challenge_progress",
  ]) {
    await db.query(
      `insert into ${table}
       select (jsonb_populate_record(null::${table}, to_jsonb(x) || jsonb_build_object('user_id', $2::uuid)
         || case when to_jsonb(x) ? 'id' then jsonb_build_object('id', gen_random_uuid()) else '{}'::jsonb end
         || case when to_jsonb(x) ? 'client_event_id' then jsonb_build_object('client_event_id', 'twin-' || (to_jsonb(x)->>'client_event_id')) else '{}'::jsonb end)).*
       from ${table} x where x.user_id = $1`,
      [ARJUN, to],
    );
  }
  await db.query(
    `select grant_entitlement($1, 'subscription', null, 'admin', now() - interval '40 days', now() + interval '20 days',
       'e2e twin', null, null, 'e2e twin')`,
    [to],
  );
  await db.query("select ensure_user_stats($1)", [to]);
  await db.query("select rebuild_user_stats($1)", [to]);
}
