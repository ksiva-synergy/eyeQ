import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { ARJUN, AUTH_READY, signIn, withDb } from "./athletes";

/**
 * `pnpm demo:refresh` and sign-in, against a real Supabase Auth: a test number attached to
 * the current Arjun signs in, after a refresh, as the new Arjun (the sign-in moves to the
 * copy; the retired one cannot sign in). Runs the real command. CI's Supabase job runs this
 * file as its own last step, since it retires the demo cohort the other specs use.
 */
const PHONE = "9000000005";

test.describe("demo refresh", () => {
  test.skip(process.env["E2E_AUTH"] !== "1", "needs Supabase Auth (E2E_AUTH=1)");
  test.use({ viewport: { width: 390, height: 844 } });

  test("a test number on Arjun signs in as the current Arjun after a refresh", async ({ page }) => {
    const before = await withDb(async (db) => {
      // The cohort's Arjun: the latest refresh's first athlete, else the seed's. (The
      // acceptance specs' copies of Arjun share his name and are not part of the cohort.)
      const r = await db.query<{ id: string }>(
        `select coalesce(
           (select (after->'athletes'->>0)::uuid from audit_log where action = 'demo.refresh'
            order by created_at desc limit 1), $1::uuid) as id`,
        [ARJUN],
      );
      const id = r.rows[0]!.id;
      await db.query("update auth.users set phone = null where phone = $1 and id <> $2", [
        `91${PHONE}`,
        id,
      ]);
      await db.query(`update auth.users set phone = $2, ${AUTH_READY} where id = $1`, [
        id,
        `91${PHONE}`,
      ]);
      return id;
    });

    execFileSync("pnpm", ["--filter", "@eyeq/db", "demo:refresh"], {
      stdio: "inherit",
      env: process.env,
    });

    const after = await withDb(async (db) => {
      const owner = await db.query<{ id: string; display_name: string; retired_at: Date | null }>(
        `select u.id, p.display_name, p.retired_at from auth.users u join profiles p on p.id = u.id
         where u.phone = $1`,
        [`91${PHONE}`],
      );
      const old = await db.query<{ phone: string | null; retired_at: Date | null }>(
        "select u.phone, p.retired_at from auth.users u join profiles p on p.id = u.id where u.id = $1",
        [before],
      );
      return { owner: owner.rows, old: old.rows[0]! };
    });
    expect(after.owner).toHaveLength(1);
    expect(after.owner[0]!.id).not.toBe(before);
    expect(after.owner[0]!.display_name).toBe("Arjun R.");
    expect(after.owner[0]!.retired_at).toBeNull();
    expect(after.old.phone).toBeNull();
    expect(after.old.retired_at).not.toBeNull();

    await signIn(page, PHONE);
    await expect(page).toHaveURL(/\/app$/);
    const me = await page.request.get("/api/v1/me");
    expect(me.status()).toBe(200);
    expect(((await me.json()) as { id: string }).id).toBe(after.owner[0]!.id);
    await page.goto("/app/compete");
    await expect(page.getByTestId("pinned-me")).toContainText("You · Arjun R.");
  });
});
