/**
 * Proves over HTTP that Supabase's Data API reaches nothing of EyeQ's: with the anon
 * (publishable) key, and with a signed-in user's token, every table read and write and
 * every function call is refused, and neither the REST root nor GraphQL lists anything.
 *
 *   pnpm --filter web check:data-api
 *
 * Env: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY. Optional: DATABASE_URL (admin, to list
 * every table and function; otherwise the names come from schema.prisma and a fixed
 * list of functions), OTP_TEST_PHONE + OTP_TEST_CODE (to repeat as `authenticated`).
 * Safe against staging and production: it only sends requests that must be refused.
 */
import { readFileSync } from "node:fs";
import pg from "pg";

const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is not set`);
  return v;
};
const SB = need("SUPABASE_URL").replace(/\/$/, "");
const KEY = need("SUPABASE_PUBLISHABLE_KEY");

async function names(): Promise<{ tables: string[]; functions: string[] }> {
  const url = process.env["DIRECT_URL"] || process.env["DATABASE_URL"];
  if (url) {
    const c = new pg.Client({ connectionString: url });
    await c.connect();
    try {
      const t = await c.query<{ n: string }>(
        `select relname as n from pg_class where relnamespace = 'public'::regnamespace and relkind in ('r','v','m','p','f') order by 1`,
      );
      const f = await c.query<{ n: string }>(
        `select distinct proname as n from pg_proc where pronamespace = 'public'::regnamespace order by 1`,
      );
      return { tables: t.rows.map((r) => r.n), functions: f.rows.map((r) => r.n) };
    } finally {
      await c.end();
    }
  }
  const schema = readFileSync(
    new URL("../../../packages/db/prisma/schema.prisma", import.meta.url),
    "utf8",
  );
  const tables = [...schema.matchAll(/^model (\w+) \{[\s\S]*?@@schema\("public"\)/gm)].map(
    (m) => m[1]!,
  );
  const functions = [
    "complete_drill",
    "home_payload",
    "progress_payload",
    "get_drill_media",
    "enroll",
    "purchase_reward",
    "grant_entitlement",
    "end_entitlement",
    "spend_coins",
    "earn_coins",
    "award_xp",
    "week_rollover",
    "ensure_profile_for",
    "ensure_my_profile",
    "rate_limit_hit",
    "grant_admin_for",
    "app_user_id",
    "config_value",
    "citext_eq",
    "citext",
  ];
  return { tables, functions };
}

let failures = 0;
function refused(status: number, what: string, body = "") {
  const ok = status >= 400;
  if (!ok) {
    failures++;
    console.log(`not ok - ${what} answered ${status}: ${body.slice(0, 200)}`);
  }
  return ok;
}

async function probe(label: string, bearer: string, tables: string[], functions: string[]) {
  const h = { apikey: KEY, authorization: `Bearer ${bearer}`, "content-type": "application/json" };
  const before = failures;
  let n = 0;
  for (const t of tables) {
    const r = await fetch(`${SB}/rest/v1/${t}?select=*&limit=1`, { headers: h });
    refused(r.status, `${label}: GET /rest/v1/${t}`, await r.text());
    const w = await fetch(`${SB}/rest/v1/${t}`, { method: "POST", headers: h, body: "{}" });
    refused(w.status, `${label}: POST /rest/v1/${t}`, await w.text());
    n += 2;
  }
  for (const f of functions) {
    const r = await fetch(`${SB}/rest/v1/rpc/${f}`, { method: "POST", headers: h, body: "{}" });
    refused(r.status, `${label}: POST /rest/v1/rpc/${f}`, await r.text());
    n++;
  }
  const root = await fetch(`${SB}/rest/v1/`, { headers: h });
  const rootBody = await root.text();
  const listed = tables.filter((t) => rootBody.includes(`"/${t}"`));
  if (listed.length) {
    failures++;
    console.log(`not ok - ${label}: the REST root lists ${listed.join(", ")}`);
  }
  const gql = await fetch(`${SB}/graphql/v1`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({
      query: "{ __schema { queryType { fields { name } } mutationType { fields { name } } } }",
    }),
  });
  const gqlBody = await gql.text();
  const exposed = tables.filter((t) => new RegExp(`"\\w*${t}\\w*"`, "i").test(gqlBody) && gql.ok);
  if (exposed.length) {
    failures++;
    console.log(`not ok - ${label}: GraphQL exposes ${exposed.join(", ")}`);
  }
  console.log(
    failures === before
      ? `ok - ${label}: ${n} table and function requests refused; REST root and GraphQL list nothing`
      : `not ok - ${label}: ${failures - before} problem(s) in ${n} requests`,
  );
}

async function main() {
  const { tables, functions } = await names();
  if (tables.length < 30)
    throw new Error(`only ${tables.length} tables found; is this the EyeQ database?`);
  await probe("anon key", KEY, tables, functions);

  const phone = process.env["OTP_TEST_PHONE"];
  const code = process.env["OTP_TEST_CODE"];
  if (phone && code) {
    const res = await fetch(`${SB}/auth/v1/verify`, {
      method: "POST",
      headers: { apikey: KEY, "content-type": "application/json" },
      body: JSON.stringify({ type: "sms", phone, token: code }),
    });
    const token = ((await res.json()) as { access_token?: string }).access_token;
    if (!token) {
      // A fresh code may be needed first; ask for one (the test number never gets an SMS).
      await fetch(`${SB}/auth/v1/otp`, {
        method: "POST",
        headers: { apikey: KEY, "content-type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const again = await fetch(`${SB}/auth/v1/verify`, {
        method: "POST",
        headers: { apikey: KEY, "content-type": "application/json" },
        body: JSON.stringify({ type: "sms", phone, token: code }),
      });
      const t2 = ((await again.json()) as { access_token?: string }).access_token;
      if (!t2) throw new Error("could not sign in the test number to probe as authenticated");
      await probe("signed-in user", t2, tables, functions);
    } else {
      await probe("signed-in user", token, tables, functions);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    failures++;
  })
  .finally(() => {
    console.log(
      failures === 0 ? "# data api check passed" : `# data api check: ${failures} failure(s)`,
    );
    process.exit(failures === 0 ? 0 : 1);
  });
