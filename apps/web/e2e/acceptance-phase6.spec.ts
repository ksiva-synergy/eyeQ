import { expect, test } from "@playwright/test";
import type pg from "pg";
import { AUTH_READY, cloneArjun, signIn, withDb } from "./athletes";

/**
 * Phase 6 acceptance (plan section 9), against a real Supabase Auth and the seed, at
 * 390 × 844: a signed-in athlete opens the leaderboard, filters by sport, sees the pinned
 * own row, buys a freeze with coins and sees the balance fall, with the ledger matching
 * the screen; and a notice queued for them is in the in-app feed (D29).
 *
 * The athlete is a fresh copy of seeded Arjun (phase 5's acceptance trained Arjun and his
 * twin today), signed in with the twin's test number, which phase 5's step has finished
 * with. CI's Supabase job runs this file as its own step, after phase 5's.
 */
const ATHLETE = "00000001-0000-4000-a000-0000000000a6";
const PHONE = "9000000007";

async function prepare(db: pg.Client) {
  await cloneArjun(db, ATHLETE, `91${PHONE}`);
  // The number moves to this copy, on a rerun too.
  await db.query("update auth.users set phone = null where phone = $1 and id <> $2", [
    `91${PHONE}`,
    ATHLETE,
  ]);
  await db.query(`update auth.users set phone = $2, ${AUTH_READY} where id = $1`, [
    ATHLETE,
    `91${PHONE}`,
  ]);
  // On the boards now, not at the next 5-minute refresh.
  await db.query("select leaderboard_refresh()");
}

const coins = (db: pg.Client) =>
  db.query<{ n: number }>("select coin_balance($1)::int as n", [ATHLETE]).then((r) => r.rows[0]!.n);
const freezes = (db: pg.Client) =>
  db.query<{ n: number }>("select freezes_held($1)::int as n", [ATHLETE]).then((r) => r.rows[0]!.n);

test.describe("phase 6 acceptance", () => {
  test.skip(process.env["E2E_AUTH"] !== "1", "needs Supabase Auth (E2E_AUTH=1)");
  test.use({ viewport: { width: 390, height: 844 } });

  test("390 px: leaderboard, sport filter, pinned own row; a freeze bought with coins; the feed", async ({
    page,
  }) => {
    const before = await withDb(async (db) => {
      await prepare(db);
      // One freeze below the cap, so a freeze can be bought.
      if ((await freezes(db)) >= 2)
        throw new Error("the athlete already holds the most freezes; reseed");
      return { coins: await coins(db), freezes: await freezes(db) };
    });
    expect(before.coins).toBeGreaterThanOrEqual(50);

    await signIn(page, PHONE);
    await expect(page).toHaveURL(/\/app$/);

    // Compete: the board, the sport filter, the own row pinned on screen.
    await page.getByRole("link", { name: "Compete" }).first().click();
    await expect(page).toHaveURL(/\/app\/compete$/);
    await expect(page.getByRole("heading", { name: "Compete" })).toBeVisible();
    const pinned = page.getByTestId("pinned-me");
    await expect(pinned).toContainText("You · Arjun R.");
    await expect(pinned).toBeInViewport();
    const globalCount = await page.getByText(/^\d+ athletes$/).innerText();
    await page.getByRole("button", { name: "My sport · Cricket" }).click();
    await expect(page.getByRole("button", { name: "My sport · Cricket" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByText(/^\d+ athletes$/)).not.toHaveText(globalCount);
    await expect(pinned).toContainText("Cricket · Lvl");
    await expect(pinned).toBeInViewport();
    const board = page.getByRole("list", { name: "Top three" });
    await expect(board.getByRole("listitem")).toHaveCount(3);

    // Rewards from the coin chip on Today: buy a freeze, the balance falls.
    await page.getByRole("link", { name: "Home" }).first().click();
    await page.getByRole("link", { name: `${before.coins} coins, open rewards` }).click();
    await expect(page).toHaveURL(/\/app\/rewards$/);
    const balance = page.getByTestId("coin-balance");
    await expect(balance).toHaveText(String(before.coins));
    await page.getByRole("button", { name: "Buy" }).click();
    const confirm = page.getByRole("dialog", { name: "Buy a streak freeze?" });
    await confirm.getByRole("button", { name: "Buy for 50 coins" }).click();
    await expect(
      page.getByText(`Streak freeze added. You hold ${before.freezes + 1}.`),
    ).toBeVisible();
    await expect(balance).toHaveText(String(before.coins - 50));

    // The ledger matches the screen (rule 1: the server decided).
    await withDb(async (db) => {
      expect(await coins(db)).toBe(before.coins - 50);
      expect(await freezes(db)).toBe(before.freezes + 1);
      const spend = await db.query(
        "select amount from coin_ledger where user_id = $1 and reason = 'spend_freeze' order by created_at desc limit 1",
        [ATHLETE],
      );
      expect(spend.rows[0]?.amount).toBe(-50);
      // A notice for the feed, as the at-risk job would queue it.
      await db.query(
        `insert into notifications (user_id, kind, dedupe_key, local_date, data)
         values ($1::uuid, 'streak_at_risk', 'e2e-feed-' || $1::text || '-' || extract(epoch from now()), current_date,
                 jsonb_build_object('streak', 12, 'ends_at', local_day_start(current_date + 1, 'Asia/Kolkata')))`,
        [ATHLETE],
      );
    });

    // The in-app feed (D29): the bell on Today, then the notice in the athlete's words.
    await page.goto("/app");
    await page.getByRole("link", { name: /^Notifications, \d+ unread$/ }).click();
    await expect(page).toHaveURL(/\/app\/notifications$/);
    await expect(
      page.getByRole("main").getByText("Your 12-day streak is at risk").first(),
    ).toBeVisible();
    await expect(
      page.getByRole("main").getByText("Train before 11:59 pm to keep it going.").first(),
    ).toBeVisible();
  });
});
