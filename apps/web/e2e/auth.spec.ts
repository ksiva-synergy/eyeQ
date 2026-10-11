import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { smallTargets } from "./touch-targets";

/**
 * Phone OTP sign-in in a browser, against a real Supabase Auth with a test number.
 * Runs where E2E_AUTH=1 (CI's Supabase job, or locally with `pnpm supabase:up`); the
 * onboarding journey (phase 5) is at the end of this file because that job runs this file.
 * E2E_AUTH_PHONE is a test number whose code is always E2E_AUTH_CODE.
 */
const phone = process.env["E2E_AUTH_PHONE"] ?? "9000000003";
const code = process.env["E2E_AUTH_CODE"] ?? "123456";

async function signIn(page: Page, path: string) {
  await page.goto(path);
  await page.waitForURL(/\/sign-in/);
  await page.getByLabel("Phone number").fill(phone);
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("Digit 1 of 6").fill(code);
  await page.getByRole("button", { name: "Verify and continue" }).click();
}

test.describe("sign-in", () => {
  test.skip(process.env["E2E_AUTH"] !== "1", "needs Supabase Auth (E2E_AUTH=1)");
  test.use({ viewport: { width: 390, height: 844 } });
  // One phone, so one at a time: Supabase Auth enforces a minimum gap between codes.
  test.describe.configure({ mode: "serial" });
  // That gap is max_frequency in supabase/config.toml (1 s). A fast first test can end
  // inside it, so each test waits it out before asking for a code.
  test.beforeEach(async ({ page }) => {
    await page.waitForTimeout(1_100);
  });

  test("phone OTP signs in, shows the profile, and signs out", async ({ page }) => {
    await page.goto("/app");
    await page.waitForURL(/\/sign-in(\?|$)/);

    await page.getByLabel("Phone number").fill(phone);
    await page.getByRole("button", { name: "Send code" }).click();
    await page.getByLabel("Digit 1 of 6").fill(code);
    await page.getByRole("button", { name: "Verify and continue" }).click();

    // A new athlete is sent from /app to onboarding (board 1c).
    await page.waitForURL("**/onboarding/profile");
    await expect(page.getByRole("heading", { name: "Set up your athlete" })).toBeVisible();

    const me = await page.request.get("/api/v1/me");
    expect(me.status()).toBe(200);
    expect((await me.json()).phone).toMatch(/^\+91/);

    // The Sign out control lives on Account (board 14); the route it calls is this one.
    expect((await page.request.post("/api/auth/sign-out")).status()).toBe(200);
    expect((await page.request.get("/api/v1/me")).status()).toBe(401);
  });

  test("a wrong code is refused with a message", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Phone number").fill(phone);
    await page.getByRole("button", { name: "Send code" }).click();
    await page.getByLabel("Digit 1 of 6").fill(code === "000000" ? "111111" : "000000");
    await page.getByRole("button", { name: "Verify and continue" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "That code is not right" }),
    ).toBeVisible();
  });

  test("a coach reaches /admin and creates a product; an athlete does not", async ({ page }) => {
    await signIn(page, "/admin/products");
    await page.waitForURL("**/admin");
    // Signed in, no admins row yet: the admin area does not exist for this account.
    await expect(page.getByRole("heading", { level: 1 })).not.toHaveText("Products");
    expect((await page.request.get("/api/admin/products")).status()).toBe(403);

    const db = new pg.Client({ connectionString: process.env["DATABASE_URL"] });
    await db.connect();
    try {
      const u = await db.query<{ id: string }>("select id from auth.users where phone = $1", [
        `91${phone}`,
      ]);
      await db.query("select grant_admin_for($1, 'coach', 'script', null)", [u.rows[0]!.id]);
    } finally {
      await db.end();
    }

    await page.goto("/admin/products");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Products");
    await page.getByRole("button", { name: "New product" }).click();
    await expect(page.getByLabel("Kind")).toBeVisible();
    expect(await smallTargets(page, "main")).toEqual([]);
    await page.getByLabel("Title").fill("E2E credit pack");
    await page.getByLabel("Kind").selectOption("credit_pack");
    await page.getByLabel("Price (₹, tax included)").fill("199");
    await page.getByLabel("Credits").fill("4");
    await page.getByRole("button", { name: "Create product" }).click();
    await expect(page.getByRole("cell", { name: /E2E credit pack/ })).toBeVisible();
    await expect(page.getByRole("cell", { name: "4 credits" }).first()).toBeVisible();
  });

  // The coach journeys share one signed-in browser: every sign-in sends a code, and
  // the app allows only a few codes per phone in a window (phase 2).
  test.describe("as the coach", () => {
    let context: BrowserContext;
    let page: Page;

    test.beforeAll(async ({ browser }) => {
      // Runs after the product test, so this account is already a coach.
      await new Promise((r) => setTimeout(r, 1_100));
      context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      page = await context.newPage();
      // The admin gate sends a signed-out visit to sign-in with next=/admin.
      await signIn(page, "/admin/programs");
      await page.waitForURL(/\/admin\/programs$/);
    });

    test.afterAll(async () => {
      await context.close();
    });

    test("a coach finds an athlete, grants a program by hand, and it unlocks and is audited", async () => {
      // Runs after the product test, so this account is already a coach. It is also the
      // athlete here: the only phone this job can sign in with.
      const db = new pg.Client({ connectionString: process.env["DATABASE_URL"] });
      await db.connect();
      try {
        const tag = crypto.randomUUID().slice(0, 8);
        const slug = `e2e-grant-${tag}`;
        const prog = await db.query<{ id: string }>(
          `insert into programs (slug, title, duration_days, is_free, in_subscription, status)
           values ($1, $2, 7, false, false, 'published') returning id`,
          [slug, `E2E grant ${tag}`],
        );
        const programId = prog.rows[0]!.id;
        const u = await db.query<{ id: string }>("select id from auth.users where phone = $1", [
          `91${phone}`,
        ]);
        const me = u.rows[0]!.id;

        await page.goto("/admin/athletes");
        await page.getByLabel("Search name or phone").fill(phone.slice(-4));
        await expect(page.getByText(`+91 ••••• •${phone.slice(-4)}`).first()).toBeVisible();
        expect(await page.content()).not.toContain(phone);
        expect(await smallTargets(page, "main")).toEqual([]);

        const before = await page.request.get(`/api/v1/programs/${slug}`);
        expect((await before.json()).hasAccess).toBe(false);

        await page.goto(`/admin/athletes/${me}`);
        await expect(page.getByRole("button", { name: "Grant access" })).toBeVisible();
        expect(await smallTargets(page, "main")).toEqual([]);
        await page.getByRole("button", { name: "Grant access" }).click();
        const sheet = page.getByRole("dialog", { name: "Manual grant" });
        await expect(sheet).toBeVisible();
        expect(await smallTargets(page, '[role="dialog"]')).toEqual([]);
        await sheet.getByRole("radio", { name: "Program" }).click();
        await sheet.getByLabel("Program, drill or challenge id").fill(programId);
        await sheet.getByLabel("Reason · kept in the audit log").fill("e2e comp");
        await sheet.getByRole("button", { name: "Grant", exact: true }).click();
        await expect(page.getByText(`Program · E2E grant ${tag}`)).toBeVisible();
        await expect(page.getByText("Manual grant · From", { exact: false }).first()).toBeVisible();

        const after = await page.request.get(`/api/v1/programs/${slug}`);
        expect((await after.json()).hasAccess).toBe(true);
        const audit = await db.query(
          `select a.actor_id from audit_log a join entitlements e on e.id::text = a.target_id
           where a.action = 'entitlement.grant' and e.scope_id = $1 and e.source = 'admin'`,
          [programId],
        );
        expect(audit.rows).toEqual([{ actor_id: me }]);
      } finally {
        await db.end();
      }
    });

    test("builds a program from pasted links, reorders, is refused with the reason, then publishes", async () => {
      // Phase 4 acceptance. Links go through the offline stub checker (APP_ENV=test):
      // references starting "dead" are missing videos.
      test.setTimeout(120_000);
      const title = `E2E Builder ${crypto.randomUUID().slice(0, 8)}`;
      await page.goto("/admin/programs");
      await page.getByRole("button", { name: "New program" }).click();
      await page.getByLabel("Program title").fill(title);
      await page.getByLabel("Length (days)").fill("3");
      await page.getByRole("button", { name: "Create program" }).click();
      await page.waitForURL(/\/admin\/programs\/[0-9a-f-]{36}$/);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
      const id = page.url().split("/").at(-1)!;

      const tree = page.getByTestId("tree-module").or(page.getByTestId("tree-session"));
      await page.getByRole("button", { name: "Module", exact: true }).click();
      await expect(page.getByTestId("tree-module")).toHaveCount(1);
      await page.getByRole("button", { name: "Module", exact: true }).click();
      await expect(page.getByTestId("tree-module")).toHaveCount(2);

      const addSession = async (module: string) => {
        await page.getByRole("button", { name: new RegExp(`^${module} · New module`) }).click();
        await page.getByRole("button", { name: "Session", exact: true }).click();
      };
      await addSession("Module 1");
      await expect(page.getByTestId("tree-session")).toHaveCount(1);
      await addSession("Module 1");
      await expect(page.getByTestId("tree-session")).toHaveCount(2);
      await addSession("Module 2");
      await expect(page.getByTestId("tree-session")).toHaveCount(3);
      await expect(tree).toHaveCount(5);

      const paste = async (day: number, links: string[]) => {
        await page.getByRole("button", { name: new RegExp(`^Day ${day} \\d+ drills?`) }).click();
        await page.getByLabel("One YouTube or Google Drive link per line").fill(links.join("\n"));
        await page.getByRole("button", { name: `Add ${links.length} drills` }).click();
        await expect(
          page.getByRole("button", { name: new RegExp(`^Day ${day} ${links.length} drills?`) }),
        ).toBeVisible();
      };
      await paste(1, [
        "https://youtu.be/e2eVideo001",
        "https://youtu.be/e2eVideo002",
        "https://youtu.be/deadVideo01",
      ]);
      await paste(2, ["https://www.youtube.com/watch?v=e2eVideo003"]);
      await paste(3, ["https://youtu.be/e2eVideo004"]);

      // Reorder without a mouse: Day 1's third drill moves up one.
      await page.getByRole("button", { name: /^Day 1 3 drills/ }).click();
      await page.getByRole("button", { name: /^Drill 3/ }).focus();
      await page.keyboard.press("Alt+ArrowUp");
      await expect(page.getByTestId("tree-drill").nth(1)).toContainText("Drill 3");

      // Refused, with the reason shown.
      const problems = page.getByTestId("publish-problems");
      await expect(problems).toContainText("Day 1 · Drill 3: No video at this link.");
      await expect(problems).toContainText("A paid program needs an active product");
      await expect(page.getByRole("button", { name: /^Publish/ })).toContainText(
        "fix 2 problems first",
      );
      const refused = await page.request.post(`/api/admin/programs/${id}/publish`, {
        headers: { "idempotency-key": crypto.randomUUID() },
      });
      expect(refused.status()).toBe(409);
      expect(JSON.stringify(await refused.json())).toContain('"reason":"not_found"');

      // Fix the link in the drill editor, make the program free, publish.
      await page.getByRole("button", { name: /^Drill 3/ }).click();
      await page
        .getByLabel("Video · paste a YouTube or Google Drive link")
        .fill("https://youtu.be/e2eVideo005");
      await page.getByRole("button", { name: "Save drill" }).click();
      await expect(problems).not.toContainText("No video at this link");
      await page.getByRole("button", { name: "Program settings" }).click();
      await page.getByRole("switch", { name: "Free program" }).check({ force: true });
      await page.getByRole("button", { name: "Save settings" }).click();
      await expect(page.getByText("Ready to publish")).toBeVisible();
      await page.getByRole("button", { name: "Publish", exact: true }).click();
      await expect(page.getByText("Published", { exact: true }).first()).toBeVisible();

      const catalogue = await page.request.get("/api/v1/programs");
      expect(catalogue.status()).toBe(200);
      const { programs } = (await catalogue.json()) as {
        programs: { id: string; title: string }[];
      };
      expect(programs.find((p) => p.id === id)?.title).toBe(title);
    });

    test("uploads a cover image: resized by the server, served from Storage, saved on the program", async () => {
      const created = await page.request.post("/api/admin/programs", {
        headers: { "idempotency-key": crypto.randomUUID() },
        data: { title: `E2E Cover ${crypto.randomUUID().slice(0, 8)}`, durationDays: 3 },
      });
      expect(created.status()).toBe(201);
      const { id } = (await created.json()) as { id: string };
      await page.goto(`/admin/programs/${id}`);
      const image = await sharp({
        create: { width: 1600, height: 900, channels: 3, background: "#7C3AED" },
      })
        .jpeg()
        .toBuffer();
      await page
        .getByLabel("Upload image")
        .setInputFiles({ name: "cover.jpg", mimeType: "image/jpeg", buffer: image });
      const preview = page.getByRole("img", { name: "Program cover" });
      await expect(preview).toBeVisible();
      const src = (await preview.getAttribute("src"))!;
      expect(src).toMatch(
        /\/storage\/v1\/object\/public\/public\/cover\/[0-9a-f-]{36}\/1200\.webp$/,
      );
      const served = await page.request.get(src);
      expect(served.status()).toBe(200);
      expect((await sharp(await served.body()).metadata()).width).toBe(1200);
      await page.getByRole("button", { name: "Save settings" }).click();
      const db = new pg.Client({ connectionString: process.env["DATABASE_URL"] });
      await db.connect();
      try {
        await expect
          .poll(
            async () =>
              (await db.query("select cover_url from programs where id = $1", [id])).rows[0]
                ?.cover_url,
          )
          .toBe(src);
      } finally {
        await db.end();
      }
    });
  });
});

/**
 * Onboarding (plan phase 5, boards 1b to 1e) against a real Supabase Auth: a new athlete
 * signs in, sets up a profile with a name, rates a baseline, and is given the free Reset as
 * a starter (the cricket recommendation is shown second, as Pro). Runs where E2E_AUTH=1.
 */
const YT_STUB = readFileSync(path.join(__dirname, "fixtures", "youtube-iframe-api.js"), "utf8");
const onboardingPhone = process.env["E2E_ONBOARDING_PHONE"] ?? "9000000004";

async function axeCheck(page: Page) {
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
}

test.describe("onboarding", () => {
  test.skip(process.env["E2E_AUTH"] !== "1", "needs Supabase Auth (E2E_AUTH=1)");
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeAll(async () => {
    // Local reruns reuse the auth user; start it again as new. CI starts from an empty database.
    const db = new pg.Client({ connectionString: process.env["DATABASE_URL"] });
    await db.connect();
    try {
      await db.query(
        `update profiles set onboarded_at = null, dob = null, visibility = 'public'
         where id in (select id from auth.users where phone = $1)`,
        [`91${onboardingPhone}`],
      );
      await db.query(
        "delete from self_ratings where user_id in (select id from auth.users where phone = $1)",
        [`91${onboardingPhone}`],
      );
    } finally {
      await db.end();
    }
  });

  test("a new athlete signs in, sets up, rates a baseline and gets a starter", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByText("Step 1 of 4")).toBeVisible();
    expect(await smallTargets(page)).toEqual([]);
    await axeCheck(page);
    await page.getByLabel("Phone number").fill(onboardingPhone);
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
        page.getByRole("button", { name: /unlocks at 80 % watched/ }).last(),
      ).toBeDisabled();
      if (i === 1) {
        expect(await smallTargets(page)).toEqual([]);
        await axeCheck(page);
      }
      await page.getByRole("button", { name: "Play drill video" }).click();
      const done = page.getByRole("button", { name: /^Mark done · \+10 XP$/ }).last();
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
      page
        .getByRole("button", { name: /Unlock program · payments open/ })
        .filter({ visible: true }),
    ).toBeDisabled();
    await page.goto("/app/programs/eye-health-reset");
    await expect(
      page.getByRole("link", { name: "Continue · day 2" }).filter({ visible: true }),
    ).toBeVisible();
  });
});
