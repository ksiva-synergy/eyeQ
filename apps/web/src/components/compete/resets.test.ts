import { describe, expect, it } from "vitest";
import { resetsLabel } from "./resets";

describe("resetsLabel", () => {
  // Monday 00:00 IST is Sunday 18:30 UTC.
  const monday = "2026-10-11T18:30:00.000Z";
  it("names the reset's weekday in the athlete's zone, with days and hours left", () => {
    expect(resetsLabel(monday, "2026-10-09T12:30:00.000Z", "Asia/Kolkata")).toBe("Mon · 2d 6h");
    // The same instant is still Sunday in New York.
    expect(resetsLabel(monday, "2026-10-09T12:30:00.000Z", "America/New_York")).toBe("Sun · 2d 6h");
  });
  it("switches to hours and minutes inside the last day, and never goes negative", () => {
    expect(resetsLabel(monday, "2026-10-11T15:05:00.000Z", "Asia/Kolkata")).toBe("Mon · 3h 25m");
    expect(resetsLabel(monday, "2026-10-12T00:00:00.000Z", "Asia/Kolkata")).toBe("Mon · 0h 0m");
  });
});
