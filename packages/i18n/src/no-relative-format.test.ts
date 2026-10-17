import { afterEach, describe, expect, it, vi } from "vitest";

/** Hermes may have no Intl.RelativeTimeFormat: importing must not throw, and days still read. */
describe("without Intl.RelativeTimeFormat", () => {
  const original = Object.getOwnPropertyDescriptor(Intl, "RelativeTimeFormat")!;
  afterEach(() => {
    Object.defineProperty(Intl, "RelativeTimeFormat", original);
    vi.resetModules();
  });

  it("imports and formats relative days from the catalogue", async () => {
    Reflect.deleteProperty(Intl, "RelativeTimeFormat");
    vi.resetModules();
    const { formatRelativeDay } = await import("./index.ts");
    const ist = "Asia/Kolkata";
    const now = new Date("2026-10-10T12:00:00Z");
    expect(formatRelativeDay(new Date("2026-10-10T02:30:00Z"), ist, now)).toBe("today");
    expect(formatRelativeDay(new Date("2026-10-09T10:00:00Z"), ist, now)).toBe("yesterday");
    expect(formatRelativeDay(new Date("2026-10-06T10:00:00Z"), ist, now)).toBe("4 days ago");
    expect(formatRelativeDay(new Date("2026-09-20T10:00:00Z"), ist, now)).toBe("3 weeks ago");
  });
});
