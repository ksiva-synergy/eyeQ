import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { smallTargets } from "./touch-targets";
import { ARJUN, AUTH_READY, cloneArjun, code, signIn, withDb } from "./athletes";
import { YT_STUB } from "./yt-stub";

/**
 * Phase 5 acceptance (plan section 9), against a real Supabase Auth and the seed, at
 * 390 × 844 and at 1440:
 *   - a new athlete goes from sign-in through onboarding and a four-drill session, sees
 *     +65 XP, a streak of 1 and the first badge, and the ledger matches the screen; then
 *     Progress, Programs and Account signed in;
 *   - seeded Arjun completes his session and sees +72 XP, streak 13 and 151 XP to level 8
 *     (at 1440 an exact twin of him, since a day's session can be done once);
 *   - a paid drill's video reference is in no payload until entitled;
 *   - the first load of /app makes no API call from the browser (the page is the one trip).
 * CI's Supabase job runs this file as its own step, after the sign-in specs.
 */
const ARJUN_TWIN = "00000001-0000-4000-a000-0000000000a1";
const PPV_DRILL = "00000006-0000-4000-a000-000000000014";
const PPV_REF = "1AbCdEfGhIjKlMnOpQrStUvWxYz";

async function axeCheck(page: Page) {
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
}

async function settledAnimations(page: Page) {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity),
  );
}

/**
 * Arjun (or his twin) as the plan states him: signed in with a test number, and his weekly
 * challenge out of the way. Depending on the weekday the seed ran, his week can already
 * hold four sessions, so today's would also finish "5 sessions this week" (+150 XP) and
 * move "to level 8"; marking it done on his row keeps the plan's numbers on any day.
 */
async function prepareArjun(db: pg.Client, id: string, phone: string) {
  await db.query("update auth.users set phone = null where phone = $1 and id <> $2", [phone, id]);
  await db.query(`update auth.users set phone = $2, ${AUTH_READY} where id = $1`, [id, phone]);
  await db.query(
    `update challenge_progress set completed_at = coalesce(completed_at, now())
     where user_id = $1 and challenge_id in (select id from challenges where type = 'weekly')`,
    [id],
  );
}

async function rule5(page: Page, userId: string) {
  for (const url of [
    "/api/v1/home",
    "/api/v1/programs",
    "/api/v1/progress",
    `/api/v1/drills/${PPV_DRILL}`,
  ]) {
    const res = await page.request.get(url);
    expect(res.status(), url).toBe(200);
    const text = await res.text();
    expect(text, url).not.toContain(PPV_REF);
    expect(text, url).not.toMatch(/video_?ref/i);
  }
  const locked = await page.request.get(`/api/v1/drills/${PPV_DRILL}/media`);
  expect(locked.status()).toBe(403);
  expect(await locked.text()).not.toContain(PPV_REF);
  await withDb((db) =>
    db.query(
      `select grant_entitlement($1, 'drill', $2, 'admin', now(), null, 'e2e', null, null, 'e2e rule 5')`,
      [userId, PPV_DRILL],
    ),
  );
  const media = await page.request.get(`/api/v1/drills/${PPV_DRILL}/media`);
  expect(media.status()).toBe(200);
  expect((await media.json()).ref).toBe(PPV_REF);
}

async function newAthleteJourney(page: Page, phone: string, checkRule5: boolean) {
  await page.goto("/sign-in");
  await expect(page.getByText("Step 1 of 4")).toBeVisible();
  expect(await smallTargets(page)).toEqual([]);
  await axeCheck(page);
  await page.getByLabel("Phone number").fill(phone);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByRole("heading", { name: "Enter the code" })).toBeVisible();
  await page.getByLabel("Digit 1 of 6").fill(code);
  await page.getByRole("button", { name: "Verify and continue" }).click();

  // Step 2: profile, with the name field board 1c leaves out.
  await page.waitForURL("**/onboarding/profile");
  await expect(page.getByText("Step 2 of 4")).toBeVisible();
  expect(await smallTargets(page)).toEqual([]);
  await axeCheck(page);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Add your name" })).toBeVisible();
  await page.getByLabel("Your name").fill("Meera K.");
  await page
    .getByRole("group", { name: "Your sport" })
    .getByRole("button", { name: "Cricket" })
    .click();
  await page
    .getByRole("group", { name: "Playing level" })
    .getByRole("button", { name: "Club" })
    .click();
  await page.getByLabel("Date of birth").fill("31 / 02 / 2001");
  await expect(page.getByText("Enter your date of birth as DD / MM / YYYY.")).toBeVisible();
  await page.getByLabel("Date of birth").fill("14 / 03 / 2001");
  await page
    .getByRole("group", { name: "Main goal" })
    .getByRole("button", { name: "Reaction speed" })
    .click();
  await page.getByRole("radio", { name: "15 min" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 3: baseline.
  await page.waitForURL("**/onboarding/baseline");
  await expect(page.getByText("Self-ratings track your training, nothing more.")).toBeVisible();
  await axeCheck(page);
  await page.getByRole("button", { name: "Save baseline" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Rate all three" })).toBeVisible();
  for (const [area, n] of [
    ["Focus", 3],
    ["Reaction", 2],
    ["Tracking", 3],
  ] as const) {
    await page
      .getByRole("radiogroup", { name: `${area} rating` })
      .getByRole("radio", { name: `${n} of 5` })
      .click();
  }
  await page.getByRole("button", { name: "Save baseline" }).click();

  // Step 4: the starter is the free Reset; the cricket program is shown as Pro, second.
  await page.waitForURL("**/onboarding/starter");
  await expect(page.getByText("Recommended for cricket")).toBeVisible();
  const starter = page.getByRole("region", { name: "3-Day Eye Health Reset" });
  await expect(starter).toContainText("Free");
  await expect(starter).toContainText("4 drills / day");
  await expect(starter).toContainText("+65 XP / day");
  await expect(page.getByText("When you're ready")).toBeVisible();
  await expect(page.getByRole("link", { name: /Cricket Vision Foundations/ })).toContainText(
    "Included in Pro",
  );
  expect(await smallTargets(page)).toEqual([]);
  await axeCheck(page);
  await page.getByRole("button", { name: "Go to Home instead" }).click();
  await page.waitForURL(/\/app$/);
  // Today, signed in: the Reset's day 1 from GET /home, rendered on the server.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/, Meera$/i);
  await expect(page.getByText("4 drills · 10 min")).toBeVisible();
  await expect(page.getByText("+65")).toBeVisible();
  await expect(page.getByRole("link", { name: "Start session" })).toBeVisible();

  // What the server now holds.
  const me = await (await page.request.get("/api/v1/me")).json();
  expect(me).toMatchObject({
    displayName: "Meera K.",
    sport: "cricket",
    playingLevel: "club",
    goal: "reaction",
    isMinor: false,
    sessionMinutes: 15,
  });
  expect(me.onboardedAt).not.toBeNull();
  const progress = await (await page.request.get("/api/v1/progress")).json();
  expect(progress.ratings.baseline).toEqual({ focus: 3, reaction: 2, tracking: 3 });
  const home = await (await page.request.get("/api/v1/home")).json();
  expect(home.today).toMatchObject({
    kind: "program",
    programSlug: "eye-health-reset",
    dayNumber: 1,
  });
  expect(home.today.drills).toHaveLength(4);
  const userId: string = me.id;

  // The first session: four drills in the player (board 3), then the summary (board 4).
  // YouTube's IFrame API is replaced by a fast stand-in (e2e/fixtures), so a drill reaches
  // its done threshold in about a second.
  await page.route("https://www.youtube.com/iframe_api", (r) =>
    r.fulfill({ contentType: "text/javascript", body: YT_STUB }),
  );
  await page.getByRole("link", { name: "Start session" }).click();
  await page.waitForURL(/\/app\/session\/[0-9a-f-]{36}$/);
  for (let i = 1; i <= 4; i++) {
    await expect(page.getByText(`Drill ${i} of 4`)).toBeVisible();
    // Locked until watched, and it says why.
    await expect(
      page.getByRole("button", { name: /unlocks at 80 % watched/ }).filter({ visible: true }),
    ).toBeDisabled();
    if (i === 1) {
      expect(await smallTargets(page)).toEqual([]);
      await axeCheck(page);
    }
    await page.getByRole("button", { name: "Play drill video" }).click();
    const done = page
      .getByRole("button", { name: /^Mark done · \+10 XP$/ })
      .filter({ visible: true });
    await expect(done).toBeEnabled({ timeout: 10_000 });
    if (i === 2) {
      // A dropped request is retried with the same client_event_id (plan phase 5, 8.2).
      const sent: string[] = [];
      await page.route("**/api/v1/completions", async (r) => {
        sent.push(
          (r.request().postDataJSON() as { events: { clientEventId: string }[] }).events[0]!
            .clientEventId,
        );
        if (sent.length === 1) return r.abort("failed");
        return r.fallback();
      });
      await done.click();
      await expect(page.getByText("Drill 3 of 4")).toBeVisible({ timeout: 15_000 });
      expect(sent.length).toBe(2);
      expect(sent[1]).toBe(sent[0]);
      await page.unroute("**/api/v1/completions");
      continue;
    }
    await done.click();
  }

  await expect(page.getByText("Session complete")).toBeVisible();
  await expect(page.getByText("+65").first()).toBeVisible();
  await expect(page.getByText("4 drills × 10")).toBeVisible();
  await expect(page.getByText("Session bonus")).toBeVisible();
  await expect(page.getByText("streak · +1")).toBeVisible();
  await expect(page.getByText("First Rep")).toBeVisible();
  // Contrast is measured once the count-up has landed (moments fade in, under 1.2 s).
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity),
  );
  await axeCheck(page);

  // The ledger matches the screen: 4 × 10 drill XP and the 25 session bonus.
  const db = new pg.Client({ connectionString: process.env["DATABASE_URL"] });
  await db.connect();
  try {
    const rows = await db.query<{ reason: string; amount: number }>(
      "select reason, amount from xp_ledger where user_id = $1 order by created_at, reason",
      [userId],
    );
    expect(rows.rows.map((r) => [r.reason, r.amount]).sort()).toEqual(
      [
        ["drill", 10],
        ["drill", 10],
        ["drill", 10],
        ["drill", 10],
        ["session_bonus", 25],
      ].sort(),
    );
    const badges = await db.query<{ slug: string }>(
      "select b.slug from user_badges ub join badges b on b.id = ub.badge_id where ub.user_id = $1",
      [userId],
    );
    expect(badges.rows.map((r) => r.slug)).toContain("first-rep");
  } finally {
    await db.end();
  }

  // Rule 5: a pay-per-view drill's video reference is in no payload until it is entitled.
  if (checkRule5) await rule5(page, userId);

  // Continue: the badge moment (board 5b), then Today, now done with a streak of 1.
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Badge unlocked").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await page.waitForURL(/\/app$/);
  await expect(page.getByText("Today's session is done")).toBeVisible();

  // Progress (board 8), signed in: the session counted, the baseline on the radar.
  await page.getByRole("link", { name: "Progress" }).first().click();
  await page.waitForURL(/\/app\/progress$/);
  await expect(page.getByRole("heading", { name: "Progress" })).toBeVisible();
  await expect(
    page.getByRole("img", { name: /^Self-ratings, baseline to now: Focus 3 → 3/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", {
      name: /^Sessions per week for the last 8 weeks: (0, ){7}1, this week so far$/,
    }),
  ).toBeVisible();

  // Programs (board 10a, 10b), signed in as a free athlete after day 1 of the Reset.
  await page.getByRole("link", { name: "Train" }).first().click();
  await page.waitForURL(/\/app\/programs$/);
  await expect(
    page
      .getByRole("region", { name: "In progress" })
      .getByRole("link", { name: /3-Day Eye Health Reset/ }),
  ).toContainText("Day 2/3");
  const cvf = page
    .getByRole("region", { name: /Catalog/ })
    .getByRole("link", { name: /Cricket Vision Foundations/ });
  await expect(cvf).toContainText("Pro · or ₹");
  await cvf.click();
  await page.waitForURL(/\/app\/programs\/cricket-vision-foundations$/);
  await expect(
    page.getByRole("button", { name: /Unlock program · payments open/ }).filter({ visible: true }),
  ).toBeDisabled();
  await page.goto("/app/programs/eye-health-reset");
  await expect(
    page.getByRole("link", { name: "Continue · day 2" }).filter({ visible: true }),
  ).toBeVisible();

  // Profile and account (board 14), signed in: settings save through PATCH /me.
  await page.goto("/app/account");
  await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Purchases & entitlements" })
      .getByRole("link", { name: /3-Day Eye Health Reset/ }),
  ).toContainText("Free · Day 2 of 3");
  const rank = page.getByRole("switch", { name: "Rank changes" });
  const rankWas = await rank.isChecked();
  await page.getByText("Rank changes", { exact: true }).click();
  await expect(rank).toBeChecked({ checked: !rankWas });
  await page.getByText("Show me on leaderboards", { exact: true }).click();
  await expect
    .poll(async () => (await (await page.request.get("/api/v1/me")).json()).visibility)
    .toBe("private");
  await page.reload();
  await expect(page.getByRole("switch", { name: "Rank changes" })).toBeChecked({
    checked: !rankWas,
  });
  await page.getByRole("button", { name: "Edit" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Edit profile" });
  await sheet.getByLabel("Your name").fill("Meera Kumar");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Meera Kumar", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/sign-in(\?|$)/);
  expect((await page.request.get("/api/v1/me")).status()).toBe(401);
}

async function arjunJourney(page: Page, phone: string, id: string) {
  await withDb((db) => prepareArjun(db, id, `91${phone}`));
  await signIn(page, phone);
  await page.waitForURL(/\/app$/);

  // First load of /app: the server renders Today from its services; the browser makes no
  // API call of its own (plan phase 5: one round trip).
  const calls: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/")) calls.push(r.url());
  });
  await page.goto("/app");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/, Arjun$/i);
  await page.waitForLoadState("networkidle");
  expect(calls).toEqual([]);

  await expect(page.getByText("+72").first()).toBeVisible();
  await page.route("https://www.youtube.com/iframe_api", (r) =>
    r.fulfill({ contentType: "text/javascript", body: YT_STUB }),
  );
  // Rows written from here on are this session's; the seed wrote others earlier today.
  const started = await withDb(
    async (db) => (await db.query<{ t: Date }>("select now() as t")).rows[0]!.t,
  );
  await page.getByRole("link", { name: /^(Start|Resume) session/ }).click();
  await page.waitForURL(/\/app\/session\/[0-9a-f-]{36}$/);
  for (let i = 1; i <= 4; i++) {
    await expect(page.getByText(`Drill ${i} of 4`)).toBeVisible();
    await page.getByRole("button", { name: "Play drill video" }).click();
    const done = page
      .getByRole("button", { name: /^Mark done · \+10 XP$/ })
      .filter({ visible: true });
    await expect(done).toBeEnabled({ timeout: 10_000 });
    await done.click();
  }

  await expect(page.getByText("Session complete")).toBeVisible();
  await expect(page.getByText("+72").first()).toBeVisible();
  await expect(page.getByText("4 drills × 10")).toBeVisible();
  await expect(page.getByText("Session bonus")).toBeVisible();
  await expect(page.getByText("Streak multiplier · 12 days · ×1.1")).toBeVisible();
  await expect(page.getByText("streak · +1")).toBeVisible();
  await expect(page.getByText("13", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("151 to Lvl 8")).toBeVisible();
  await settledAnimations(page);
  await axeCheck(page);

  // The ledger matches the screen: 4 × 10, the 25 bonus and the 7 multiplier.
  const rows = await withDb((db) =>
    db.query<{ reason: string; amount: number }>(
      "select reason, amount from xp_ledger where user_id = $1 and created_at >= $2",
      [id, started],
    ),
  );
  expect(rows.rows.map((r) => [r.reason, r.amount]).sort()).toEqual(
    [
      ["drill", 10],
      ["drill", 10],
      ["drill", 10],
      ["drill", 10],
      ["session_bonus", 25],
      ["streak_multiplier", 7],
    ].sort(),
  );
  const stats = await withDb((db) =>
    db.query<{ total_xp: number; current_streak: number }>(
      "select total_xp, current_streak from user_stats where user_id = $1",
      [id],
    ),
  );
  expect(stats.rows[0]).toEqual({ total_xp: 2112, current_streak: 13 });
}

test.describe("phase 5 acceptance", () => {
  test.skip(process.env["E2E_AUTH"] !== "1", "needs Supabase Auth (E2E_AUTH=1)");
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    await withDb(async (db) => {
      // Local reruns reuse the new athletes' auth users; start them again as new. CI
      // starts from an empty database.
      for (const phone of ["919000000004", "919000000006"]) {
        await db.query(
          `update profiles set onboarded_at = null, dob = null, visibility = 'public'
             where id in (select id from auth.users where phone = $1)`,
          [phone],
        );
        await db.query(
          "delete from self_ratings where user_id in (select id from auth.users where phone = $1)",
          [phone],
        );
      }
      // Arjun's twin is copied before Arjun trains, so both start the day the same.
      await cloneArjun(db, ARJUN_TWIN, "919000000007");
    });
  });

  for (const [width, height, phone, rule] of [
    [390, 844, "9000000004", true],
    [1440, 1000, "9000000006", false],
  ] as const) {
    test(`${width} px: a new athlete signs in, onboards, trains, and sees +65, streak 1 and the first badge`, async ({
      browser,
    }) => {
      const context = await browser.newContext({ viewport: { width, height } });
      const page = await context.newPage();
      try {
        await newAthleteJourney(page, phone, rule);
      } finally {
        await context.close();
      }
    });
  }

  for (const [width, height, phone, id] of [
    [390, 844, "9000000005", ARJUN],
    [1440, 1000, "9000000007", ARJUN_TWIN],
  ] as const) {
    test(`${width} px: seeded Arjun completes his session: +72 XP, streak 13, 151 to level 8`, async ({
      browser,
    }) => {
      const context = await browser.newContext({ viewport: { width, height } });
      const page = await context.newPage();
      try {
        await arjunJourney(page, phone, id);
      } finally {
        await context.close();
      }
    });
  }
});
