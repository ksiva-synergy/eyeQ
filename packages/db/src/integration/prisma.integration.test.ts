/**
 * Integration test against DATABASE_URL (run after `pnpm db:migrate`): the Prisma client
 * with asAthlete() sets app.user_id per transaction, so RLS scopes model queries and the
 * public game functions to that athlete, and the setting does not leak between calls.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { targetFor } from "../target.ts";
import { asAthlete, createDb } from "../index.ts";

// Writes test rows, so local databases only (./target.ts refuses anything else).
const url =
  process.env["DIRECT_URL"] || process.env["DATABASE_URL"] ? targetFor("test") : undefined;
const describeDb = url ? describe : describe.skip;

describeDb("prisma client as an athlete", () => {
  const pool = new pg.Pool({ connectionString: url, max: 2 });
  const db = createDb({ connectionString: url ?? "", max: 2 });
  const ids: string[] = [];

  beforeAll(async () => {
    const c = await pool.connect();
    try {
      await c.query("set role eyeq_owner");
      for (const name of ["Prisma A", "Prisma B"]) {
        const r = await c.query<{ id: string }>(
          `insert into profiles (id, display_name, sport) values (gen_random_uuid(), $1, 'cricket') returning id`,
          [name],
        );
        ids.push(r.rows[0]!.id);
        await c.query("select ensure_user_stats($1)", [r.rows[0]!.id]);
      }
    } finally {
      c.release();
    }
  });

  afterAll(async () => {
    await db.$disconnect();
    await pool.end();
  });

  it("reads only the athlete's own profile under eyeq_api", async () => {
    const [a] = ids;
    const rows = await asAthlete(db, a!, async (tx) => {
      // The runtime connects as eyeq_api; this test connects as the admin and drops to it.
      await tx.$executeRaw`set local role eyeq_api`;
      return tx.profiles.findMany({ select: { id: true } });
    });
    expect(rows).toEqual([{ id: a }]);
  });

  it("calls a public game function for that athlete", async () => {
    const [, b] = ids;
    const rows = await asAthlete(db, b!, async (tx) => {
      await tx.$executeRaw`set local role eyeq_api`;
      return tx.$queryRaw<{ uid: string; badges: unknown }[]>`
        select app_user_id()::text as uid, my_badges() as badges`;
    });
    expect(rows[0]?.uid).toBe(b);
    expect(rows[0]?.badges).toBeDefined();
  });

  it("does not leak app.user_id outside the transaction", async () => {
    const rows = await db.$queryRaw<{ uid: string | null }[]>`
      select nullif(current_setting('app.user_id', true), '') as uid`;
    expect(rows[0]?.uid ?? null).toBeNull();
  });
});
