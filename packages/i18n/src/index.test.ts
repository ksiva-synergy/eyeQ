import { describe, expect, it } from "vitest";
import { formatDate, formatNumber, formatRelativeDay, t } from "./index.ts";

describe("i18n", () => {
  it("returns the message for a key", () => {
    expect(t("app.name")).toBe("EyeQ");
  });
  it("fills placeholders and formats numbers for en-IN", () => {
    expect(t("xp.total", { xp: formatNumber(2040) })).toBe("2,040 XP total");
    expect(t("level.toNext", { xp: 223, next: 8 })).toBe("223 XP to 8");
    expect(formatNumber(100000)).toBe("1,00,000");
  });
  it("leaves an unknown placeholder visible rather than blank", () => {
    expect(t("xp.gain", {})).toBe("+{n} XP");
  });
  it("formats dates and relative days for en-IN", () => {
    expect(formatDate("2026-10-10T06:00:00Z")).toBe("10 Oct 2026");
    const now = new Date("2026-10-10T12:00:00");
    expect(formatRelativeDay(new Date("2026-10-10T08:00:00"), now)).toBe("today");
    expect(formatRelativeDay(new Date("2026-10-09T23:00:00"), now)).toBe("yesterday");
    expect(formatRelativeDay(new Date("2026-10-07T08:00:00"), now)).toBe("3 days ago");
    expect(formatRelativeDay(new Date("2026-09-19T08:00:00"), now)).toBe("3 weeks ago");
  });
});
