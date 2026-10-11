import type { Page } from "@playwright/test";

/**
 * Text that would clip or overlap: every visible text node's line boxes are
 * compared pairwise, and any text inside a box narrower than its content
 * (overflow hidden) counts as clipped. Screen-reader-only text is skipped.
 *
 * A root with no visible text is a problem, not a pass: streamed pages render after
 * `goto` resolves, and a check on the empty page used to pass without measuring
 * anything. Wait for the screen's content before calling this.
 *
 * Text in a `position: fixed` bar (the action bar above the dock) is meant to sit over
 * the page as it scrolls, so it is only compared with page text once the page is
 * scrolled to the end: anything still under the bar there can never be read.
 */
export async function textProblems(page: Page, root: string) {
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
    const fixedLayer = (el: Element | null): Element | null => {
      for (let e = el; e && e !== document.body; e = e.parentElement)
        if (getComputedStyle(e).position === "fixed") return e;
      return null;
    };

    type Item = { text: string; node: Text; lh: number; layer: Element | null };
    const items: Item[] = [];
    const problems: string[] = [];
    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent?.trim();
      if (!text || n.parentElement?.closest("svg") || hidden(n.parentElement)) continue;
      const lh = parseFloat(getComputedStyle(n.parentElement!).lineHeight);
      items.push({ text, node: n as Text, lh, layer: fixedLayer(n.parentElement) });
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

    // Line boxes, not glyph boxes: display type sets line-height below 1, so the
    // font's content area legitimately reaches into the next line's box.
    const measure = () =>
      items.flatMap((it) => {
        const range = document.createRange();
        range.selectNodeContents(it.node);
        return Array.from(range.getClientRects())
          .filter((g) => g.width > 0.5 && g.height > 0.5)
          .map((g) => {
            const h = Number.isFinite(it.lh) ? Math.min(g.height, it.lh) : g.height;
            return { ...it, r: new DOMRect(g.x, g.y + (g.height - h) / 2, g.width, h) };
          });
      });
    const overlaps = (
      boxes: ReturnType<typeof measure>,
      pair: (a: Item, b: Item) => boolean,
      label: string,
    ) => {
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i]!;
          const b = boxes[j]!;
          if (a.node === b.node || !pair(a, b)) continue;
          const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
          const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
          if (w > 1 && h > 1)
            problems.push(`${label}: "${a.text.slice(0, 30)}" × "${b.text.slice(0, 30)}"`);
        }
      }
    };

    const boxes = measure();
    if (boxes.length === 0) return [`nothing rendered in ${rootSel}`];
    overlaps(boxes, (a, b) => a.layer === b.layer, "overlap");

    // Bars fixed to the lower half of the viewport, checked at the end of the page.
    const bottomBar = (l: Element | null) =>
      l !== null && l.getBoundingClientRect().top > window.innerHeight / 2;
    if (items.some((it) => bottomBar(it.layer))) {
      const y = window.scrollY;
      window.scrollTo(0, document.documentElement.scrollHeight);
      overlaps(
        measure(),
        (a, b) =>
          (a.layer === null && bottomBar(b.layer)) || (b.layer === null && bottomBar(a.layer)),
        "under the bar at the end of the page",
      );
      window.scrollTo(0, y);
    }

    if (document.documentElement.scrollWidth > window.innerWidth + 1) {
      problems.push(
        `horizontal scroll: ${document.documentElement.scrollWidth} > ${window.innerWidth}`,
      );
    }
    return [...new Set(problems)];
  }, root);
}

export async function scaleText(page: Page) {
  // Same effect as the browser's text size at 200 %: rem doubles, px does not. Set on the
  // root element itself: an added style sheet changed the root's size but, after
  // emulateMedia, Chrome kept descendants' rem values from before, so the check measured
  // the page at 100 % while reporting 200 %.
  const ratio = await page.evaluate(async () => {
    const remPx = () => {
      const probe = document.createElement("div");
      probe.style.cssText = "position:absolute;visibility:hidden;width:10rem";
      document.body.appendChild(probe);
      const w = probe.getBoundingClientRect().width;
      probe.remove();
      return w / 10;
    };
    const before = remPx();
    const root = document.documentElement;
    root.style.setProperty("font-size", "200%", "important");
    // Re-resolve every element's styles: without this, Chrome under emulateMedia kept
    // some descendants' rem values from before the change.
    root.style.display = "none";
    void root.offsetHeight;
    root.style.removeProperty("display");
    // Measure the relaid-out page with its web fonts, not a fixed delay's guess at it.
    await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return remPx() / before;
  });
  if (Math.abs(ratio - 2) > 0.01) throw new Error(`text did not scale to 200 % (×${ratio})`);
}
