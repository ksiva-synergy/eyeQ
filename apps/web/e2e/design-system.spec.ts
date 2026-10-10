import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 3 acceptance (plan section 9): gallery matches the board's values,
 * athlete shell at 390 × 844 and 1440, automated accessibility checks in both
 * themes, nothing clips or overlaps at 200 % text, moments cross-fade under
 * reduced motion.
 */

const GALLERY = "/dev/components";

async function setTheme(page: Page, theme: "Dark" | "Light") {
  await page
    .getByRole("radiogroup", { name: "Gallery theme" })
    .getByRole("radio", { name: theme })
    .click();
  await expect(page.getByTestId("gallery")).toHaveAttribute("data-theme", theme.toLowerCase());
}

async function axe(page: Page) {
  const result = await new AxeBuilder({ page })
    .include('[data-testid="gallery"]')
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const summary = result.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    nodes: v.nodes
      .slice(0, 5)
      .map((n) => `${n.target.join(" ")} — ${n.failureSummary?.split("\n")[1] ?? ""}`),
  }));
  expect(summary).toEqual([]);
}

/**
 * Text that would clip or overlap: every visible text node's line boxes are
 * compared pairwise, and any text inside a box narrower than its content
 * (overflow hidden) counts as clipped. Screen-reader-only text is skipped.
 */
async function textProblems(page: Page, root: string) {
  return page.evaluate((rootSel) => {
    const rootEl = document.querySelector(rootSel);
    if (!rootEl) return ["root not found"];
    const isSrOnly = (el: Element) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return (
        cs.position === "absolute" &&
        ((r.width <= 1 && r.height <= 1) ||
          cs.clip === "rect(0px, 0px, 0px, 0px)" ||
          cs.clipPath === "inset(50%)")
      );
    };
    const hidden = (el: Element | null): boolean => {
      for (let e = el; e && e !== document.body; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (
          cs.display === "none" ||
          cs.visibility === "hidden" ||
          cs.opacity === "0" ||
          isSrOnly(e)
        )
          return true;
      }
      return false;
    };
    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
    const boxes: { text: string; r: DOMRect; node: Text }[] = [];
    const problems: string[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent?.trim();
      if (!text || n.parentElement?.closest("svg") || hidden(n.parentElement)) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      // Line boxes, not glyph boxes: display type sets line-height below 1, so the
      // font's content area legitimately reaches into the next line's box.
      const lh = parseFloat(getComputedStyle(n.parentElement!).lineHeight);
      for (const g of Array.from(range.getClientRects())) {
        if (g.width <= 0.5 || g.height <= 0.5) continue;
        const h = Number.isFinite(lh) ? Math.min(g.height, lh) : g.height;
        const r = new DOMRect(g.x, g.y + (g.height - h) / 2, g.width, h);
        boxes.push({ text, r, node: n as Text });
      }
      for (let e = n.parentElement; e && e !== rootEl; e = e.parentElement) {
        const cs = getComputedStyle(e);
        const clipsX = cs.overflowX !== "visible" && e.scrollWidth > e.clientWidth + 1;
        const clipsY =
          cs.overflowY !== "visible" &&
          cs.overflowY !== "auto" &&
          e.scrollHeight > e.clientHeight + 1;
        if (clipsX || clipsY) {
          problems.push(
            `clipped: "${text.slice(0, 40)}" in <${e.tagName.toLowerCase()} class="${e.className}">`,
          );
          break;
        }
      }
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        if (a.node === b.node) continue;
        const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (w > 1 && h > 1)
          problems.push(`overlap: "${a.text.slice(0, 30)}" × "${b.text.slice(0, 30)}"`);
      }
    }
    if (document.documentElement.scrollWidth > window.innerWidth + 1) {
      problems.push(
        `horizontal scroll: ${document.documentElement.scrollWidth} > ${window.innerWidth}`,
      );
    }
    return [...new Set(problems)];
  }, root);
}

async function scaleText(page: Page) {
  // Same effect as the browser's text size at 200 %: rem doubles, px does not.
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await page.waitForTimeout(100);
}

test.describe("component gallery", () => {
  test.use({ viewport: { width: 1440, height: 1000 } });

  test("matches the board's colours, type sizes, radii and spacing", async ({ page }) => {
    await page.goto(GALLERY);
    const board = page.getByTestId("board");
    const style = (sel: ReturnType<Page["locator"]>, props: string[]) =>
      sel.evaluate((el, ps) => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return {
          ...Object.fromEntries(ps.map((p) => [p, cs.getPropertyValue(p)])),
          height: Math.round(r.height),
          width: Math.round(r.width),
        };
      }, props);

    const cta = await style(board.getByRole("link", { name: "Start today's session" }).first(), [
      "background-color",
      "border-top-left-radius",
      "font-size",
      "font-weight",
      "color",
    ]);
    expect(cta).toMatchObject({
      "background-color": "rgb(218, 33, 65)",
      "border-top-left-radius": "14px",
      "font-size": "15px",
      "font-weight": "800",
      color: "rgb(255, 255, 255)",
      height: 52,
    });
    const primary = await style(board.getByRole("button", { name: "Continue" }).first(), [
      "background-color",
    ]);
    expect(primary["background-color"]).toBe("rgb(124, 58, 237)");
    const ghost = await style(board.getByRole("button", { name: "Maybe later" }).first(), [
      "background-color",
      "border-top-color",
    ]);
    expect(ghost).toMatchObject({
      "background-color": "rgb(30, 30, 40)",
      "border-top-color": "rgb(42, 42, 55)",
    });

    const iconButton = await style(board.getByRole("button", { name: "Back" }), [
      "border-top-left-radius",
    ]);
    expect(iconButton).toMatchObject({ "border-top-left-radius": "12px", height: 44, width: 44 });

    const spec = await style(board.locator('[data-spec="cards"]'), [
      "background-color",
      "border-top-left-radius",
      "padding-top",
    ]);
    expect(spec).toMatchObject({
      "background-color": "rgb(21, 21, 29)",
      "border-top-left-radius": "20px",
      "padding-top": "20px",
    });
    const card = await style(board.locator('[data-spec="cards"] > div').first(), [
      "border-top-left-radius",
      "padding-top",
    ]);
    expect(card).toMatchObject({ "border-top-left-radius": "20px", "padding-top": "16px" });

    const chip = await style(
      board.locator('[data-spec="cards"] span.rounded-s', { hasText: "Cricket" }),
      ["border-top-left-radius", "font-size", "font-weight"],
    );
    expect(chip).toMatchObject({
      "border-top-left-radius": "8px",
      "font-size": "12px",
      "font-weight": "700",
      height: 28,
    });

    const tabbar = await style(board.locator('[data-spec="tabbar"] nav'), ["background-color"]);
    expect(tabbar.height).toBe(84);

    const display = await style(board.locator('[data-spec="heroes"]').getByText("LVL 7"), [
      "font-size",
      "font-family",
      "font-weight",
    ]);
    expect(display["font-size"]).toBe("26px");
    expect(display["font-family"]).toMatch(/display|Barlow/i);

    const label = await style(board.locator('[data-spec="cards"]').getByText("Surface-1 card"), [
      "font-size",
      "letter-spacing",
      "text-transform",
    ]);
    expect(label).toMatchObject({
      "font-size": "11px",
      "letter-spacing": "1.32px",
      "text-transform": "uppercase",
    });

    const xpBar = await style(board.locator('[data-spec="heroes"] [role="progressbar"]').nth(1), [
      "background-color",
    ]);
    expect(xpBar).toMatchObject({ "background-color": "rgb(30, 30, 40)", height: 10 });

    const meRow = await style(board.locator('[data-spec="level"] div.border-primary').first(), [
      "background-color",
      "border-top-color",
      "border-top-left-radius",
    ]);
    expect(meRow).toMatchObject({
      "background-color": "rgb(36, 27, 63)",
      "border-top-color": "rgb(124, 58, 237)",
      "border-top-left-radius": "14px",
    });

    const lightCta = await style(
      board.locator('[data-spec="light"]').getByRole("link", { name: "Start today's session" }),
      ["background-color"],
    );
    expect(lightCta["background-color"]).toBe("rgb(200, 16, 46)");
  });

  test("fonts are self-hosted", async ({ page }) => {
    const external: string[] = [];
    page.on("request", (r) => {
      if (/fonts\.(googleapis|gstatic)\.com/.test(r.url())) external.push(r.url());
    });
    await page.goto(GALLERY);
    await page.evaluate(() => document.fonts.ready);
    const loaded = await page.evaluate(() =>
      [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.weight),
    );
    expect(external).toEqual([]);
    expect(loaded.length).toBeGreaterThanOrEqual(2);
  });

  test("passes automated accessibility checks in the dark theme", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(GALLERY);
    await setTheme(page, "Dark");
    await axe(page);
  });

  test("passes automated accessibility checks in the light theme", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(GALLERY);
    await setTheme(page, "Light");
    await axe(page);
  });

  for (const width of [390, 1440]) {
    test(`nothing clips or overlaps at 200 % text, ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(GALLERY);
      await scaleText(page);
      expect(await textProblems(page, '[data-testid="gallery"]')).toEqual([]);
    });
  }

  test("a sheet is a centred dialog on desktop and a bottom sheet on a phone", async ({ page }) => {
    await page.goto(GALLERY);
    await page.getByRole("button", { name: "Open sheet" }).click();
    const dialog = page.getByRole("dialog", { name: "Use a streak freeze?" });
    await expect(dialog).toBeVisible();
    await dialog.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
    let box = (await dialog.boundingBox())!;
    expect(Math.abs(box.x + box.width / 2 - 720)).toBeLessThan(2);
    expect(box.y + box.height).toBeLessThan(1000 - 40);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Open sheet" }).click();
    await expect(dialog).toBeVisible();
    await dialog.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
    box = (await dialog.boundingBox())!;
    expect(Math.round(box.y + box.height)).toBe(844);
    expect(Math.round(box.width)).toBe(390);
  });
});

test.describe("motion", () => {
  test("moments cross-fade under reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(GALLERY);
    await page.getByRole("button", { name: "Replay" }).click();
    await page.getByTestId("play-level-up").click();
    await expect(page.getByRole("dialog", { name: /Level 8/ })).toBeVisible();
    const animations = await page.evaluate(() =>
      document.getAnimations().map((a) => {
        const effect = a.effect as KeyframeEffect;
        const props = new Set(effect.getKeyframes().flatMap((k) => Object.keys(k)));
        ["offset", "easing", "composite", "computedOffset"].forEach((p) => props.delete(p));
        return {
          name: (a as CSSAnimation).animationName ?? "",
          duration: Number(effect.getTiming().duration),
          props: [...props],
        };
      }),
    );
    expect(animations.length).toBeGreaterThan(0);
    for (const a of animations) {
      expect(a.duration, a.name).toBeLessThanOrEqual(10);
      expect(a.props, a.name).toEqual(["opacity"]);
    }
  });

  test("moments move with full motion, each under 1.2 s", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(GALLERY);
    await page.getByTestId("play-level-up").click();
    const animations = await page.evaluate(() =>
      document.getAnimations().map((a) => {
        const effect = a.effect as KeyframeEffect;
        const t = effect.getTiming();
        return {
          name: (a as CSSAnimation).animationName ?? "",
          end: Number(t.delay ?? 0) + Number(t.duration),
          iterations: t.iterations,
          transforms: effect.getKeyframes().some((k) => "transform" in k),
        };
      }),
    );
    const moments = animations.filter((a) => a.iterations === 1 && a.name !== "eyeq-hold");
    expect(moments.some((a) => a.name === "eyeq-badge-in" && a.transforms)).toBe(true);
    for (const a of moments) expect(a.end, a.name).toBeLessThanOrEqual(1200);
  });
});

test.describe("athlete shell", () => {
  const destinations = ["Home", "Train", "Compete", "Progress", "Profile"];

  test("390 × 844: bottom tab bar with the five destinations", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/app/programs");
    const tabs = page.getByTestId("tab-bar").getByRole("navigation", { name: "Main" });
    await expect(tabs).toBeVisible();
    await expect(page.getByTestId("side-nav")).toBeHidden();
    await expect(tabs.getByRole("link")).toHaveText(destinations);
    await expect(tabs.getByRole("link", { name: "Train" })).toHaveAttribute("aria-current", "page");
    const box = (await tabs.boundingBox())!;
    expect(Math.round(box.y + box.height)).toBe(844);
    expect(Math.round(box.height)).toBe(84);
    for (const link of await tabs.getByRole("link").all()) {
      const b = (await link.boundingBox())!;
      expect(b.height).toBeGreaterThanOrEqual(44);
    }
    await tabs.getByRole("link", { name: "Compete" }).click();
    await expect(page).toHaveURL(/\/app\/compete$/);
    await expect(tabs.getByRole("link", { name: "Compete" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(await textProblems(page, "body")).toEqual([]);
  });

  test("1440: side navigation of board 16 with the same destinations", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1040 });
    await page.goto("/app/progress");
    const side = page.getByTestId("side-nav").getByRole("navigation", { name: "Main" });
    await expect(side).toBeVisible();
    await expect(page.getByTestId("tab-bar")).toBeHidden();
    await expect(side.getByRole("link")).toHaveText(destinations);
    await expect(side.getByRole("link", { name: "Progress" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await side.getByRole("link", { name: "Train" }).click();
    await expect(page).toHaveURL(/\/app\/programs$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Programs");
  });

  for (const width of [390, 1440]) {
    test(`shell survives 200 % text at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/app/compete");
      await scaleText(page);
      expect(await textProblems(page, "body")).toEqual([]);
    });
  }

  test("passes automated accessibility checks", async ({ page }) => {
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/app/progress");
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(result.violations.map((v) => v.id)).toEqual([]);
    }
  });
});

test.describe("admin and public shells", () => {
  test("admin layout is board 17: light theme, side navigation", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/programs$/);
    const side = page.getByTestId("admin-side-nav");
    await expect(side.getByRole("link")).toHaveText([
      "Program builder",
      "Athletes",
      "Game settings",
    ]);
    const bg = await page
      .locator("[data-theme=light]")
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe("rgb(245, 244, 250)");
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(result.violations.map((v) => v.id)).toEqual([]);
  });

  test("admin navigation still works on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/athletes");
    await expect(page.getByTestId("admin-side-nav")).toBeHidden();
    await expect(
      page.getByRole("navigation", { name: "Coach admin" }).getByRole("link", { name: "Athletes" }),
    ).toHaveAttribute("aria-current", "page");
    expect(await textProblems(page, "body")).toEqual([]);
  });

  test("public layout is dark and passes accessibility checks", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Train your brain.");
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(result.violations.map((v) => v.id)).toEqual([]);
  });
});
