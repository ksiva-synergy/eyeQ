/**
 * Supabase's Data API (PostgREST, GraphQL) runs SQL as the anon role for the anon key
 * and as authenticated for a signed-in Supabase user. This test acts as each role and
 * tries every table, view and function in public: all must be refused (migrations
 * 0013, 0014). On plain Postgres the two roles are created for the test and dropped.
 * The HTTP-level check against a running Supabase API is apps/web/scripts/check-data-api.ts.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { targetFor } from "../target.js";

const url =
  process.env["DIRECT_URL"] || process.env["DATABASE_URL"] ? targetFor("test") : undefined;
const describeDb = url ? describe : describe.skip;

const ROLES = ["anon", "authenticated"] as const;

interface Rel {
  name: string;
}
interface Fn {
  name: string;
  args: string[];
}

describeDb("Supabase Data API roles reach nothing in public", () => {
  const admin = new pg.Client({ connectionString: url });
  const created: string[] = [];
  let rels: Rel[] = [];
  let fns: Fn[] = [];

  beforeAll(async () => {
    await admin.connect();
    for (const r of ROLES) {
      const e = await admin.query("select 1 from pg_roles where rolname = $1", [r]);
      if (e.rowCount === 0) {
        await admin.query(`create role ${r} nologin`);
        created.push(r);
      }
    }
    // pgTAP is installed by the test runner only; skip its objects.
    const notPgtap = `not exists (select 1 from pg_depend d join pg_extension e on e.oid = d.refobjid
                      where d.objid = %s and d.deptype = 'e' and e.extname = 'pgtap')`;
    rels = (
      await admin.query<Rel>(
        `select quote_ident(c.relname) as name from pg_class c
         where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'm', 'p', 'f')
           and ${notPgtap.replace("%s", "c.oid")} order by 1`,
      )
    ).rows;
    fns = (
      await admin.query<Fn>(
        `select quote_ident(p.proname) as name,
                coalesce(array(select format_type(t, null) from unnest(p.proargtypes) t), '{}') as args
         from pg_proc p
         where p.pronamespace = 'public'::regnamespace and p.prokind in ('f', 'p')
           and ${notPgtap.replace("%s", "p.oid")} order by 1`,
      )
    ).rows;
  });

  afterAll(async () => {
    for (const r of created) await admin.query(`drop role ${r}`);
    await admin.end();
  });

  for (const role of ROLES) {
    it(`${role} can read no table and call no function`, async () => {
      expect(rels.length).toBeGreaterThan(30);
      expect(fns.length).toBeGreaterThan(50);
      const client = new pg.Client({ connectionString: url });
      await client.connect();
      const reached: string[] = [];
      try {
        await client.query(`set role ${role}`);
        for (const r of rels) {
          try {
            await client.query(`select * from public.${r.name} limit 1`);
            reached.push(`table ${r.name}`);
          } catch (e) {
            if ((e as { code?: string }).code !== "42501")
              reached.push(`table ${r.name}: ${String(e)}`);
          }
        }
        for (const f of fns) {
          // Untyped nulls: the role cannot even resolve EyeQ's types, so the call must be
          // refused at the schema (42501), before any overload is chosen.
          const args = f.args.map(() => "null").join(", ");
          try {
            await client.query(`select public.${f.name}(${args})`);
            reached.push(`function ${f.name}(${f.args.join(", ")})`);
          } catch (e) {
            if ((e as { code?: string }).code !== "42501")
              reached.push(`function ${f.name}(${f.args.join(", ")}): ${String(e)}`);
          }
        }
      } finally {
        await client.end();
      }
      expect(reached).toEqual([]);
    });
  }
});
