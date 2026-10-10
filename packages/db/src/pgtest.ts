/**
 * Runs the pgTAP suite in db/tests against DATABASE_URL.
 *
 * Each *.sql file is run inside a transaction that is rolled back, so tests
 * never leave rows behind and can run in any order. Output is TAP; a failing
 * assertion or a plan mismatch fails the process.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
const TESTS_DIR = path.resolve(here, "../../../db/tests");

async function main() {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not set");
  const only = process.argv[2];
  const files = (await readdir(TESTS_DIR))
    .filter((f) => f.endsWith(".sql") && (!only || f.includes(only)))
    .sort();
  if (files.length === 0) throw new Error(`no tests in ${TESTS_DIR}`);

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  let failed = 0;
  let total = 0;
  try {
    await client.query("create extension if not exists pgtap");
    for (const file of files) {
      const sql = await readFile(path.join(TESTS_DIR, file), "utf8");
      console.log(`# ${file}`);
      await client.query("begin");
      try {
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
