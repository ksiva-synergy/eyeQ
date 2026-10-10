/**
 * Runs before `prisma db pull` (pnpm db:types). The committed schema.prisma is
 * introspected from plain Postgres (local compose, as CI's drift check does), where
 * migration 0014 creates a small stand-in for auth.users. A Supabase database has the
 * whole auth schema, which would land in schema.prisma as drift, so refuse it.
 */
import pg from "pg";
import { adminUrl, assertTarget } from "./target.ts";

const url = adminUrl();
assertTarget("status", url);
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const r = await client.query<{ supabase: boolean }>(
    "select to_regclass('auth.identities') is not null as supabase",
  );
  if (r.rows[0]?.supabase) {
    console.error(
      "pnpm db:types introspects the plain Postgres database (pnpm db:up, port 5432), not a\n" +
        "Supabase one: its auth schema would show up as drift. Run:\n" +
        "  DIRECT_URL= DATABASE_URL=postgres://postgres:postgres@localhost:5432/eyeq pnpm db:types",
    );
    process.exit(1);
  }
} finally {
  await client.end();
}
