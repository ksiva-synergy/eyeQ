import type { Page } from "@playwright/test";

/**
 * Text that would clip or overlap: every visible text node's line boxes are
 * compared pairwise, and any text inside a box narrower than its content
 * (overflow hidden) counts as clipped. Screen-reader-only text is skipped.
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

export async function scaleText(page: Page) {
  // Same effect as the browser's text size at 200 %: rem doubles, px does not.
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await page.waitForTimeout(100);
}
