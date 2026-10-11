import type { Page } from "@playwright/test";

/**
 * Waits until no finite animation or transition is running (moments land under 1.2 s,
 * colour transitions in 150 ms), so contrast is measured on the settled page, not mid-fade.
 * Infinite decorative loops (skeleton shimmer, at-risk pulse) are ignored.
 */
export async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity),
  );
}
