/**
 * The day-4 paywall (plan phase 7): offered once the free Reset is finished, from day
 * `paywall.day_after_reset` counted from the Reset's start, and not to an athlete with Pro
 * or enrolled in a paid program.
 */
import { asAthlete, createDb, type PrismaClient } from "@eyeq/db";
import { seedConfig } from "@eyeq/db/seed";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localAdminUrl, makeAthlete } from "../../../test/db";
import { runtimeUrl } from "../db";
import { resetPaywallDue } from "./paywall";

const url = localAdminUrl();
const describeDb = url ? describe : describe.skip;

describeDb("the day-4 paywall", () => {
  const admin = new pg.Client({ connectionString: url });
  let api: PrismaClient;
  let reset: string;
  let paid: string;
  const today = "2026-10-17";

  const due = (u: string, date = today) => asAthlete(api, u, (tx) => resetPaywallDue(tx, u, date));
  const finishedReset = async (u: string, started: string) =>
    admin.query(
      `insert into enrollments (user_id, program_id, start_local_date, current_day, completed_at, is_active)
       values ($1, $2, $3, 4, now(), false)`,
      [u, reset, started],
    );

  beforeAll(async () => {
    await admin.connect();
    await seedConfig(admin);
    api = createDb({ connectionString: runtimeUrl("eyeq_api", { DATABASE_URL: url! }), max: 2 });
    const tag = crypto.randomUUID().slice(0, 8);
    reset = (
      await admin.query<{ id: string }>(
        `insert into programs (slug, title, duration_days, is_free, status) values ($1, 'Reset', 3, true, 'published') returning id`,
        [`reset-${tag}`],
      )
    ).rows[0]!.id;
    paid = (
      await admin.query<{ id: string }>(
        `insert into programs (slug, title, duration_days, is_free, in_subscription, status) values ($1, 'Paid', 21, false, true, 'published') returning id`,
        [`paid-${tag}`],
      )
    ).rows[0]!.id;
  });

  afterAll(async () => {
    await api.$disconnect();
    await admin.end();
  });

  it("is due on day 4 after the Reset started, not on day 3, nor before finishing it", async () => {
    const u = await makeAthlete(admin, { name: "Reset done" });
    expect(await due(u)).toBe(false);
    await finishedReset(u, "2026-10-14"); // today is day 4
    expect(await due(u)).toBe(true);
    expect(await due(u, "2026-10-16")).toBe(false); // day 3
  });

  it("is not shown to an athlete with Pro", async () => {
    const u = await makeAthlete(admin, { name: "Has Pro" });
    await finishedReset(u, "2026-10-10");
    await admin.query(
      "select grant_entitlement($1, 'subscription', null, 'admin', now() - interval '1 day', now() + interval '30 days', null, null, null, 'test')",
      [u],
    );
    expect(await due(u)).toBe(false);
  });

  it("is not shown to an athlete enrolled in a paid program", async () => {
    const u = await makeAthlete(admin, { name: "Bought one" });
    await finishedReset(u, "2026-10-10");
    await admin.query(
      `insert into enrollments (user_id, program_id, start_local_date, is_active) values ($1, $2, '2026-10-15', true)`,
      [u, paid],
    );
    expect(await due(u)).toBe(false);
  });
});
