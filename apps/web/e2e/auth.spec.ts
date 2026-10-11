import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";
import sharp from "sharp";
import { YT_STUB } from "./yt-stub";
import { smallTargets } from "./touch-targets";

/**
 * Phone OTP sign-in in a browser, against a real Supabase Auth with a test number.
 * Runs where E2E_AUTH=1 (CI's Supabase job, or locally with `pnpm supabase:up`); the
 * onboarding journey (phase 5) is at the end of this file because that job runs this file.
 * E2E_AUTH_PHONE is a test number whose code is always E2E_AUTH_CODE.
 */
// One test number per sign-in journey. The app allows 5 codes per number per hour (phase 2),
// so a journey that shared a number with another could be refused by the other's use of it
// (the cause of the old "wrong code" flake, made worse when a retry re-ran a serial group).
const phone = process.env["E2E_AUTH_PHONE"] ?? "9000000003";
const wrongCodePhone = process.env["E2E_WRONG_CODE_PHONE"] ?? "9000000008";
const coachPhone = process.env["E2E_COACH_PHONE"] ?? "9000000009";
const code = process.env["E2E_AUTH_CODE"] ?? "123456";

async function signIn(page: Page, path: string) {
  await page.goto(path);
  await page.waitForURL(/\/sign-in/);
  await page.getByLabel("Phone number").fill(coachPhone);
  await page.getByRole("button", { name: "Send code" }).click();
  await codeScreen(page);
  await page.getByLabel("Digit 1 of 6").fill(code);
  await page.getByRole("button", { name: "Verify and continue" }).click();
}

/** The code screen, or a failure that says why the code was refused (not a 30 s wait). */
async function codeScreen(page: Page) {
  // The form's own alert (it carries an icon), not Next.js's route announcer.
  const refused = page.getByRole("alert").filter({ has: page.locator("svg") });
  await expect(
    page.getByRole("heading", { name: "Enter the code" }).or(refused.first()),
  ).toBeVisible();
  if (!(await page.getByRole("heading", { name: "Enter the code" }).isVisible())) {
    throw new Error(`the code was refused: ${(await refused.first().textContent())?.trim()}`);
  }
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
    await codeScreen(page);
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
    await page.getByLabel("Phone number").fill(wrongCodePhone);
    await page.getByRole("button", { name: "Send code" }).click();
    await codeScreen(page);
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
        `91${coachPhone}`,
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
          `91${coachPhone}`,
        ]);
        const me = u.rows[0]!.id;

        await page.goto("/admin/athletes");
        await page.getByLabel("Search name or phone").fill(coachPhone.slice(-4));
        await expect(page.getByText(`+91 ••••• •${coachPhone.slice(-4)}`).first()).toBeVisible();
        expect(await page.content()).not.toContain(coachPhone);
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

    test("previews a session as the athlete plays it, recording nothing", async () => {
      // The newest program with a session that has drills: the one the builder test made.
      const db = new pg.Client({ connectionString: process.env["DATABASE_URL"] });
      await db.connect();
      let programId = "";
      let sessionId = "";
      let me = "";
      const completions = async () =>
        (
          await db.query("select count(*)::int as n from drill_completions where user_id = $1", [
            me,
          ])
        ).rows[0].n as number;
      try {
        const row = await db.query<{ program_id: string; id: string }>(
          `select s.program_id, s.id from sessions s join programs p on p.id = s.program_id
           where exists (select 1 from session_drills sd where sd.session_id = s.id)
           order by p.created_at desc, s.day_number limit 1`,
        );
        programId = row.rows[0]!.program_id;
        sessionId = row.rows[0]!.id;
        me = (
          await db.query<{ id: string }>("select id from auth.users where phone = $1", [
            `91${coachPhone}`,
          ])
        ).rows[0]!.id;
        const before = await completions();

        await page.route("https://www.youtube.com/iframe_api", (r) =>
          r.fulfill({ contentType: "text/javascript", body: YT_STUB }),
        );
        await page.goto(`/admin/programs/${programId}`);
        await page
          .getByRole("button", { name: /^Day 1/ })
          .first()
          .click();
        await page.getByRole("link", { name: "Preview as athlete" }).click();
        await page.waitForURL(new RegExp(`/admin-preview/${programId}/${sessionId}$`));
        await expect(page.getByText("nothing you do here is saved")).toBeVisible();
        for (;;) {
          await page.getByRole("button", { name: "Play drill video" }).click();
          const done = page
            .getByRole("button", { name: /^Mark done · \+\d+ XP$/ })
            .filter({ visible: true });
          await expect(done).toBeEnabled({ timeout: 10_000 });
          await done.click();
          if (await page.getByText("Preview finished").isVisible()) break;
        }
        await expect(page.getByRole("link", { name: "Back to the builder" })).toHaveAttribute(
          "href",
          `/admin/programs/${programId}`,
        );
        expect(await completions()).toBe(before);
      } finally {
        await page.unroute("https://www.youtube.com/iframe_api");
        await db.end();
      }
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
