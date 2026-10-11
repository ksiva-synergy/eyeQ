import type { Page } from "@playwright/test";

/**
 * Ground rule 13: every control has a 44 px target (tokens size.touch-min). A control may
 * be drawn smaller (admin inputs 40, small buttons 36) as long as its hit area reaches 44.
 *
 * Measured the way a finger meets it: from the centre of each visible control, the points
 * 21.5 px above, below, left and right must hit-test to that control (a pseudo-element hit
 * resolves to its host). So padding, an `::after` hit area and a transparent border all
 * count, and a hit area clipped by an `overflow: hidden` ancestor or covered by a neighbour
 * does not. Returns one line per control that falls short.
 */
export async function smallTargets(page: Page, root = "body", min = 44): Promise<string[]> {
  const selector = [
    "button",
    "a[href]",
    "input:not([type=hidden])",
    "select",
    "textarea",
    "summary",
    '[role="button"]',
    '[role="radio"]',
    '[role="tab"]',
    '[role="link"]',
    '[role="switch"]',
    '[role="checkbox"]',
  ].join(",");
  const els = await page.locator(root).locator(selector).all();
  const problems: string[] = [];
  for (const loc of els) {
    if (!(await loc.isVisible())) continue;
    const problem = await loc.evaluate((el, need) => {
      el.scrollIntoView({ block: "center", inline: "center" });
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.pointerEvents === "none") return null;
      // A visually hidden input inside its <label> (switches, file pickers) is reached
      // through the label; any other visually hidden control (a skip link) is measured
      // while focused, which is when it shows.
      let target: Element = el;
      if (el.getBoundingClientRect().width <= 1) {
        const label = el.closest("label");
        if (label) target = label;
        else (el as HTMLElement).focus();
      }
      const r = target.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return null;
      // Size: the box itself, or its absolutely positioned ::after (.eyeq-hit), whichever
      // is larger. Strict: 43.9 fails.
      const after = getComputedStyle(target, "::after");
      const hasHit = after.content !== "none" && after.position === "absolute";
      const hitW = Math.max(r.width, hasHit ? parseFloat(after.width) : 0);
      const hitH = Math.max(r.height, hasHit ? parseFloat(after.height) : 0);
      // Reach: hit-test near the edges of that area, so a neighbour drawn over it or an
      // overflow-hidden ancestor clipping it counts against it. 1 px in from the edge,
      // because hit testing snaps fractional box edges to whole pixels.
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const half = need / 2 - 1;
      const reaches = (x: number, y: number) => {
        const hit = document.elementFromPoint(x, y);
        return !!hit && (hit === target || target.contains(hit));
      };
      const width = hitW >= need && reaches(cx - half, cy) && reaches(cx + half, cy);
      const height = hitH >= need && reaches(cx, cy - half) && reaches(cx, cy + half);
      if (width && height) return null;
      const name = (
        el.getAttribute("aria-label") ??
        (el as HTMLElement).innerText ??
        el.getAttribute("name") ??
        ""
      )
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 40);
      const label =
        el instanceof HTMLInputElement || el instanceof HTMLSelectElement
          ? (el.labels?.[0]?.innerText.trim() ?? name)
          : name;
      return `${el.tagName.toLowerCase()} "${label}" drawn ${Math.round(r.width)}×${Math.round(r.height)}, hit area ${Math.round(hitW)}×${Math.round(hitH)}, short or covered in ${[!width && "width", !height && "height"].filter(Boolean).join(" and ")}`;
    }, min);
    if (problem) problems.push(problem);
  }
  return [...new Set(problems)];
}
