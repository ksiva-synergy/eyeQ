/**
 * Migration runner. Plain SQL files in db/migrations, applied in name order,
 * forward only, each in its own transaction, recorded in schema_migrations.
 *
 *   tsx src/migrate.ts up      apply pending migrations
 *   tsx src/migrate.ts status  list applied and pending
 *   tsx src/migrate.ts reset   drop and recreate the public schema, then apply all
 *
 * Reads DATABASE_URL (admin role: eyeq_owner in Azure, postgres locally).
 * Ground rule 7: never edit an applied migration; a change is a new file.
 */
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = path.resolve(here, "../../../db/migrations");

const NAME_RE = /^(\d{4,})_[a-z0-9_]+\.sql$/;

export interface MigrationFile {
  version: string;
  name: string;
  sql: string;
  checksum: string;
}

export async function loadMigrations(dir = MIGRATIONS_DIR): Promise<MigrationFile[]> {
  const entries = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const files: MigrationFile[] = [];
  for (const name of entries) {
    const m = NAME_RE.exec(name);
    if (!m) throw new Error(`Bad migration file name: ${name} (want NNNN_snake_case.sql)`);
    const sql = await readFile(path.join(dir, name), "utf8");
    files.push({
      version: m[1]!,
      name,
      sql,
      checksum: createHash("sha256").update(sql).digest("hex"),
    });
  }
  const versions = new Set(files.map((f) => f.version));
  if (versions.size !== files.length) throw new Error("Duplicate migration version");
  return files;
}

async function ensureTable(client: pg.Client) {
  await client.query(`
    create table if not exists schema_migrations (
      version text primary key,
      name text not null,
      checksum text not null,
      applied_at timestamptz not null default now()
    )`);
}

async function applied(
  client: pg.Client,
): Promise<Map<string, { name: string; checksum: string }>> {
  const r = await client.query<{ version: string; name: string; checksum: string }>(
    "select version, name, checksum from schema_migrations order by version",
  );
  return new Map(r.rows.map((row) => [row.version, { name: row.name, checksum: row.checksum }]));
}

export async function up(client: pg.Client, log: (s: string) => void = console.log) {
  await ensureTable(client);
  await client.query("select pg_advisory_lock(7342001)");
  try {
    const done = await applied(client);
    const files = await loadMigrations();
    let count = 0;
    for (const f of files) {
      const prev = done.get(f.version);
      if (prev) {
        if (prev.checksum !== f.checksum) {
          throw new Error(
            `Migration ${f.name} was edited after it was applied. Add a new migration instead.`,
          );
        }
        continue;
      }
      log(`applying ${f.name}`);
      await client.query("begin");
      try {
        await client.query(f.sql);
        await client.query(
          "insert into schema_migrations (version, name, checksum) values ($1, $2, $3)",
          [f.version, f.name, f.checksum],
        );
        await client.query("commit");
      } catch (e) {
        await client.query("rollback");
        throw e;
      }
      count++;
    }
    log(count === 0 ? "nothing to apply" : `applied ${count} migration(s)`);
  } finally {
    await client.query("select pg_advisory_unlock(7342001)");
  }
}

export async function status(client: pg.Client, log: (s: string) => void = console.log) {
  await ensureTable(client);
  const done = await applied(client);
  for (const f of await loadMigrations()) {
    log(`${done.has(f.version) ? "applied " : "pending "} ${f.name}`);
  }
}

export async function reset(client: pg.Client, log: (s: string) => void = console.log) {
  if (process.env["NODE_ENV"] === "production") {
    throw new Error("reset refuses to run with NODE_ENV=production");
  }
  log("dropping schema public");
  await client.query("drop schema if exists public cascade; create schema public;");
  await up(client, log);
}

async function main() {
  const cmd = process.argv[2] ?? "up";
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    if (cmd === "up") await up(client);
    else if (cmd === "status") await status(client);
    else if (cmd === "reset") await reset(client);
    else throw new Error(`unknown command ${cmd}`);
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
