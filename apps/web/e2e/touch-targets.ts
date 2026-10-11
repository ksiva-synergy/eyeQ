import type { Page } from "@playwright/test";

/**
 * Ground rule 13: every control has a 44 px target (tokens size.touch-min). A control may
 * be drawn smaller (admin inputs 40, small buttons 36) as long as its hit area reaches 44.
 *
 * Measured the way a finger meets it, for each visible control under `root`:
 *   size   the larger of its box and its absolutely positioned ::after (.eyeq-hit) is at
 *          least 44 in both axes (strict: 43.9 fails);
 *   reach  hit-testing 21 px out from its centre, up, down, left and right, lands on the
 *          control (a pseudo-element hit resolves to its host), so a neighbour drawn over
 *          the hit area or an overflow-hidden ancestor clipping it counts against it.
 *          21 rather than 22 because hit testing snaps fractional box edges to whole pixels.
 * A visually hidden input inside its <label> (switches, file pickers) is measured as the
 * label; any other visually hidden control (a skip link) is measured while focused.
 *
 * One page.evaluate, so a list that re-renders mid-check cannot leave a stale locator.
 * Returns one line per control that falls short.
 */
export async function smallTargets(page: Page, root = "body", min = 44): Promise<string[]> {
  return page.evaluate(
    ({ rootSel, need }) => {
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
      const els = Array.from(document.querySelectorAll(rootSel)).flatMap((r) =>
        Array.from(r.querySelectorAll<HTMLElement>(selector)),
      );
      const problems: string[] = [];
      for (const el of els) {
        let target: Element = el;
        if (el.getBoundingClientRect().width <= 1) {
          const label = el.closest("label");
          if (label) target = label;
          else el.focus();
        }
        if (!target.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
        if (getComputedStyle(el).pointerEvents === "none") continue;
        target.scrollIntoView({ block: "center", inline: "center" });
        const r = target.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;

        const after = getComputedStyle(target, "::after");
        const hasHit = after.content !== "none" && after.position === "absolute";
        const hitW = Math.max(r.width, hasHit ? parseFloat(after.width) : 0);
        const hitH = Math.max(r.height, hasHit ? parseFloat(after.height) : 0);

        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const half = need / 2 - 1;
        const reaches = (x: number, y: number) => {
          const hit = document.elementFromPoint(x, y);
          return !!hit && (hit === target || target.contains(hit));
        };
        const width = hitW >= need && reaches(cx - half, cy) && reaches(cx + half, cy);
        const height = hitH >= need && reaches(cx, cy - half) && reaches(cx, cy + half);
        if (width && height) continue;

        const name =
          el instanceof HTMLInputElement || el instanceof HTMLSelectElement
            ? (el.labels?.[0]?.innerText ?? el.getAttribute("aria-label") ?? el.name)
            : (el.getAttribute("aria-label") ?? el.innerText);
        const short = [!width && "width", !height && "height"].filter(Boolean).join(" and ");
        problems.push(
          `${el.tagName.toLowerCase()} "${(name ?? "").trim().replace(/\s+/g, " ").slice(0, 40)}" drawn ${Math.round(r.width)}×${Math.round(r.height)}, hit area ${Math.round(hitW)}×${Math.round(hitH)}, short or covered in ${short}`,
        );
      }
      return [...new Set(problems)];
    },
    { rootSel: root, need: min },
  );
}
