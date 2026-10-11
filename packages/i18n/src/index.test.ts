import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatNumber,
  formatRelativeDay,
  t,
  formatShortWeekday,
  formatWeekdayDate,
  hourIn,
  formatRupees,
} from "./index.ts";

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

describe("day labels", () => {
  it("formats a local date without shifting it across zones", () => {
    expect(formatWeekdayDate("2026-10-10")).toBe("Saturday 10 Oct");
    expect(formatShortWeekday("2026-10-10")).toBe("Sat");
  });
  it("gives the hour in the athlete's time zone", () => {
    expect(hourIn("2026-10-11T13:00:00Z", "Asia/Kolkata")).toBe(18);
    expect(hourIn("2026-10-11T13:00:00Z", "America/New_York")).toBe(9);
  });
});

describe("money", () => {
  it("formats integer paise as rupees", () => {
    expect(formatRupees(129900)).toBe("₹1,299");
    expect(formatRupees(9900)).toBe("₹99");
  });
});
