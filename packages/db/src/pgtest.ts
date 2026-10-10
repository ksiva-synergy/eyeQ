/**
 * Runs the pgTAP suite in db/tests against DATABASE_URL.
 *
 * Each *.sql test file runs inside a transaction that is rolled back, so tests never
 * leave rows behind and can run in any order. Before each file the runner:
 *   - seeds game_config from db/seed/game_config.json (rule 8),
 *   - loads packages/game/vectors/*.json into a temp table test_vectors(name, data) (rule 9),
 *   - runs every db/tests/_*.sql prelude (shared fixtures).
 * Output is TAP; a failing assertion, a plan mismatch or an error fails the process.
 *   pnpm db:test            all files
 *   pnpm db:test streak     files whose name contains "streak"
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { seedConfig } from "./seed.js";
import { targetFor } from "./target.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const TESTS_DIR = path.resolve(here, "../../../db/tests");
const VECTORS_DIR = path.resolve(here, "../../../packages/game/vectors");

async function loadVectors(client: pg.Client) {
  await client.query(
    "create temp table test_vectors (name text primary key, data jsonb not null) on commit drop",
  );
  for (const f of (await readdir(VECTORS_DIR)).filter((f) => f.endsWith(".json")).sort()) {
    const data = await readFile(path.join(VECTORS_DIR, f), "utf8");
    await client.query("insert into test_vectors (name, data) values ($1, $2::jsonb)", [
      f.replace(/\.json$/, ""),
      data,
    ]);
  }
}

async function main() {
  const url = targetFor("test");
  const only = process.argv[2];
  const all = (await readdir(TESTS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  const preludes = all.filter((f) => f.startsWith("_"));
  const files = all.filter((f) => !f.startsWith("_") && (!only || f.includes(only)));
  if (files.length === 0) throw new Error(`no tests in ${TESTS_DIR}`);

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query("create extension if not exists pgtap");
  let failed = 0;
  let total = 0;
  try {
    for (const file of files) {
      const sql = await readFile(path.join(TESTS_DIR, file), "utf8");
      console.log(`# ${file}`);
      await client.query("begin");
      try {
        await client.query("set local role eyeq_owner");
        await seedConfig(client);
        await loadVectors(client);
        for (const p of preludes)
          await client.query(await readFile(path.join(TESTS_DIR, p), "utf8"));
        const res = await client.query(sql);
        const results = Array.isArray(res) ? res : [res];
        for (const r of results) {
          for (const row of r.rows as Record<string, string>[]) {
            const line = Object.values(row)[0] ?? "";
            console.log(line);
            if (/^ok \d/.test(line)) total++;
            if (/^not ok \d/.test(line)) {
              total++;
              failed++;
            }
            if (/^# Looks like you failed|^# Looks like you planned/.test(line)) failed++;
          }
        }
      } catch (e) {
        failed++;
        console.log(`not ok - ${file} raised: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        await client.query("rollback");
      }
    }
  } finally {
    await client.end();
  }
  console.log(`# ${total} assertion(s), ${failed} failure(s) across ${files.length} file(s)`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
