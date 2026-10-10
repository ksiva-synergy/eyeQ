import { describe, expect, it } from "vitest";
import { formatNumber, t } from "./index.ts";

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
});
