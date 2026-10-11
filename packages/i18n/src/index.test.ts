import { describe, expect, it } from "vitest";
import {
  formatCalendarDate,
  formatDate,
  formatDateTime,
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
    expect(formatDate("2026-10-10T06:00:00Z", "Asia/Kolkata")).toBe("10 Oct 2026");
    const now = new Date("2026-10-10T06:30:00Z"); // 12:00 in Kolkata
    const ist = "Asia/Kolkata";
    expect(formatRelativeDay(new Date("2026-10-10T02:30:00Z"), ist, now)).toBe("today");
    expect(formatRelativeDay(new Date("2026-10-09T17:30:00Z"), ist, now)).toBe("yesterday");
    expect(formatRelativeDay(new Date("2026-10-07T02:30:00Z"), ist, now)).toBe("3 days ago");
    expect(formatRelativeDay(new Date("2026-09-19T02:30:00Z"), ist, now)).toBe("3 weeks ago");
    expect(formatRelativeDay(new Date("2026-07-01T02:30:00Z"), ist, now)).toBe("1 Jul 2026");
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

describe("dates in the athlete's zone", () => {
  it("formatDate puts an instant on the named zone's calendar, not the runtime's", () => {
    // 20:30 UTC on 1 Oct is already 2 Oct in India and still 1 Oct in New York.
    expect(formatDate("2026-10-01T20:30:00Z", "Asia/Kolkata")).toBe("2 Oct 2026");
    expect(formatDate("2026-10-01T20:30:00Z", "America/New_York")).toBe("1 Oct 2026");
  });

  it("formatDateTime gives the named zone's clock", () => {
    expect(formatDateTime("2026-10-01T20:30:00Z", "Asia/Kolkata")).toBe("2 Oct, 2:00 am");
    expect(formatDateTime("2026-10-01T20:30:00Z", "America/New_York")).toBe("1 Oct, 4:30 pm");
  });

  it("formatRelativeDay counts days on the named zone's calendar", () => {
    // now is 01:00 IST on 2 Oct; 23:30 IST the evening before is yesterday in India,
    // while in New York both instants fall on 1 Oct.
    const now = new Date("2026-10-01T19:30:00Z");
    const earlier = new Date("2026-10-01T19:00:00Z");
    const dayBefore = new Date("2026-10-01T18:00:00Z"); // 23:30 IST on 1 Oct
    expect(formatRelativeDay(earlier, "Asia/Kolkata", now)).toBe("today");
    expect(formatRelativeDay(dayBefore, "Asia/Kolkata", now)).toBe("yesterday");
    expect(formatRelativeDay(dayBefore, "America/New_York", now)).toBe("today");
  });

  it("formatCalendarDate shows the server's local date as that day, in any zone", () => {
    expect(formatCalendarDate("2026-10-02")).toBe("2 Oct 2026");
    expect(formatCalendarDate("2026-01-01")).toBe("1 Jan 2026");
  });
});
