/**
 * Seeds game_config from db/seed/game_config.json (the same file packages/game reads),
 * then runs db/seed/seed.sql (demo content) and db/seed/athletes.sql (the demo athletes
 * and their activity) reproducing the prototype. `pnpm demo:refresh` lays the athletes
 * down again under fresh ids (demo-refresh.ts).
 * Local and staging only.
 *   pnpm db:seed            config + demo data
 *   pnpm db:seed config     config only
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { targetFor } from "./target.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const SEED_DIR = path.resolve(here, "../../../db/seed");
/** Seeded rules carry a fixed active_from so re-seeding updates in place. */
export const SEED_ACTIVE_FROM = "2000-01-01T00:00:00Z";

export async function seedConfig(client: pg.Client): Promise<number> {
  const raw = JSON.parse(await readFile(path.join(SEED_DIR, "game_config.json"), "utf8")) as Record<
    string,
    unknown
  >;
  let n = 0;
  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith("$")) continue;
    await client.query(
      `insert into game_config (key, value, active_from, note) values ($1, $2::jsonb, $3, 'seed')
       on conflict (key, active_from) do update set value = excluded.value`,
      [key, JSON.stringify(value), SEED_ACTIVE_FROM],
    );
    n++;
  }
  return n;
}

async function main() {
  if (process.env["NODE_ENV"] === "production")
    throw new Error("seed refuses to run with NODE_ENV=production");
  const url = targetFor("seed");
  const only = process.argv[2];
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("begin");
    await client.query("set role eyeq_owner");
    const n = await seedConfig(client);
    console.log(`game_config: ${n} keys`);
    if (only !== "config") {
      await client.query(await readFile(path.join(SEED_DIR, "seed.sql"), "utf8"));
      // The seed's cohort keeps its fixed ids: athlete n is sid(1, n).
      await client.query(
        "create or replace function pg_temp.uid(n integer) returns uuid language sql immutable as $$ select pg_temp.sid(1, n) $$",
      );
      await client.query(await readFile(path.join(SEED_DIR, "athletes.sql"), "utf8"));
      console.log("demo content and athletes seeded");
    }
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
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
