/** Shared setup for web integration tests: a local admin connection and test athletes. */
import pg from "pg";

const LOCAL = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
  "postgres",
  "host.docker.internal",
]);

/** DATABASE_URL when it is a local database; integration tests never touch a hosted one. */
export function localAdminUrl(): string | undefined {
  const url = process.env["DIRECT_URL"] || process.env["DATABASE_URL"];
  if (!url) return undefined;
  if (!LOCAL.has(new URL(url).hostname))
    throw new Error("integration tests run against a local database only");
  return url;
}

/** Creates an auth user (as Supabase Auth would) and, unless told not to, its profile. */
export async function makeAthlete(
  admin: pg.Client,
  opts: { name?: string; profile?: boolean; phone?: string } = {},
): Promise<string> {
  const r = await admin.query<{ id: string }>(
    "insert into auth.users (id, phone) values (gen_random_uuid(), $1) returning id",
    [opts.phone ?? null],
  );
  const id = r.rows[0]!.id;
  if (opts.profile !== false)
    await admin.query("select ensure_profile_for($1, $2)", [id, opts.name ?? "Athlete"]);
  return id;
}
