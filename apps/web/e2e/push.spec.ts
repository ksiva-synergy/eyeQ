import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { notificationText } from "../src/lib/notification-text";
import { settled } from "./settle";
import { scaleText, textProblems } from "./text-scale";
import { smallTargets } from "./touch-targets";

/**
 * Web push in the browser and the in-app feed (plan phase 6, D29).
 *
 * The push hop through a real push service (FCM for Chrome) cannot run in CI: the
 * browser has no push service there, so `pushManager.subscribe` is refused. What runs:
 * the app's service worker receives a push carrying exactly what the dispatcher sends
 * (delivered through the DevTools protocol) and shows it as a system notification. The
 * dispatcher's encrypted, VAPID-signed request is proven in
 * src/server/notify/dispatch.integration.test.ts; the full chain on staging.
 */
async function axe(page: Page) {
  const r = await new AxeBuilder({ page })
    .include("main")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
}

// The full Chromium build for this file: the headless shell refuses notification
// permission outright.
test.use({ channel: "chromium" });

test.describe("Web push on a desktop browser", () => {
  test.use({ viewport: { width: 1440, height: 1000 } });

  test("the service worker shows a pushed notice as a system notification", async ({
    page,
    context,
    baseURL,
  }) => {
    const origin = new URL(baseURL!).origin;
    await context.grantPermissions(["notifications"], { origin });
    await page.goto("/dev/account");
    await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();

    const cdp = await context.newCDPSession(page);
    await cdp.send("ServiceWorker.enable");
    let registrationId: string | null = null;
    const activated = new Set<string>();
    cdp.on("ServiceWorker.workerRegistrationUpdated", (e) => {
      for (const r of e.registrations)
        if (!r.isDeleted && r.scopeURL.startsWith(origin)) registrationId = r.registrationId;
    });
    cdp.on("ServiceWorker.workerVersionUpdated", (e) => {
      for (const v of e.versions) if (v.status === "activated") activated.add(v.registrationId);
    });
    // Open tabs hear about each push (the worker posts to them); a push delivered before the
    // worker is activated is dropped, so wait for activation.
    await page.evaluate(async () => {
      const w = window as unknown as { pushes: unknown[] };
      w.pushes = [];
      navigator.serviceWorker.addEventListener("message", (e) => w.pushes.push(e.data));
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const worker = (await navigator.serviceWorker.ready).active!;
      if (worker.state !== "activated")
        await new Promise<void>((done) =>
          worker.addEventListener("statechange", () => worker.state === "activated" && done()),
        );
    });
    await expect.poll(() => registrationId !== null && activated.has(registrationId)).toBe(true);

    // Record what the worker asks the system to show. (Chromium's own store of shown
    // notifications, getNotifications(), drops entries when several browsers run at once,
    // so the call is what is checked; it still goes through to the real showNotification.)
    const sw =
      context.serviceWorkers().find((w) => w.url().endsWith("/sw.js")) ??
      (await context.waitForEvent("serviceworker"));
    await sw.evaluate(() => {
      const g = self as unknown as {
        shown: unknown[];
        registration: ServiceWorkerRegistration;
      };
      g.shown = [];
      const show = g.registration.showNotification.bind(g.registration);
      g.registration.showNotification = (title: string, options?: NotificationOptions) => {
        g.shown.push({ title, body: options?.body, url: (options?.data as { url: string }).url });
        return show(title, options);
      };
    });

    // The payload the dispatcher sends for a 12-day streak at risk (lib/notification-text).
    const text = notificationText(
      "streak_at_risk",
      { streak: 12, ends_at: "2026-10-10T18:30:00Z" },
      "Asia/Kolkata",
    );
    await cdp.send("ServiceWorker.deliverPushMessage", {
      origin,
      registrationId: registrationId!,
      data: JSON.stringify({ ...text, id: "e2e-push" }),
    });
    await expect
      .poll(() => sw.evaluate(() => (self as unknown as { shown: unknown[] }).shown))
      .toEqual([
        {
          title: "Your 12-day streak is at risk",
          body: "Train before 11:59 pm to keep it going.",
          url: "/app",
        },
      ]);
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { pushes: unknown[] }).pushes))
      .toEqual([{ type: "eyeq:push", id: "e2e-push" }]);
  });

  test("Profile offers browser notifications and says iPhone needs the Home Screen first", async ({
    page,
  }) => {
    await page.goto("/dev/account");
    const row = page.getByTestId("push-opt-in");
    await expect(row.getByText("Browser notifications")).toBeVisible();
    await expect(row.getByText(/add EyeQ to your Home Screen first/)).toBeVisible();
    // Signed out (the preview), the key cannot be fetched: it says so and nothing breaks.
    await row.getByRole("switch", { name: "Browser notifications" }).click({ force: true });
    await expect(row.getByRole("status")).toHaveText(/aren't set up yet|Couldn't turn on/);
    await expect(page.getByRole("link", { name: "Notifications" })).toHaveAttribute(
      "href",
      "/app/notifications",
    );
  });
});

for (const [width, height] of [
  [390, 844],
  [1440, 1000],
] as const) {
  test.describe(`Notification feed at ${width} px`, () => {
    test.use({ viewport: { width, height } });

    test("lists every notice with its own words, unread marked in words too; accessible", async ({
      page,
    }) => {
      await page.goto("/dev/notifications");
      await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
      const items = page.getByRole("main").getByRole("listitem");
      await expect(items).toHaveCount(3);
      await expect(items.nth(0)).toContainText("Your 12-day streak is at risk");
      await expect(items.nth(0)).toContainText("Unread");
      await expect(items.nth(1)).toContainText("5 sessions this week closes Mon 12:00 am");
      await expect(items.nth(2)).not.toContainText("Unread");
      await expect(items.nth(1).getByRole("link")).toHaveAttribute(
        "href",
        "/app/compete?tab=challenges",
      );
      expect(await smallTargets(page, "main")).toEqual([]);
      for (const scheme of ["dark", "light"] as const) {
        await page.emulateMedia({ colorScheme: scheme });
        await settled(page);
        await axe(page);
      }
    });

    test("an empty feed says what will appear", async ({ page }) => {
      await page.goto("/dev/notifications?state=empty");
      await expect(page.getByText("Nothing yet")).toBeVisible();
    });

    test("nothing clips or overlaps at 200 % text", async ({ page }) => {
      await page.goto("/dev/notifications");
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      await scaleText(page);
      expect(await textProblems(page, "main")).toEqual([]);
    });
  });
}
