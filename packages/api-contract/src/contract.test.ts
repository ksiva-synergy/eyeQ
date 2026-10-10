import { describe, expect, it } from "vitest";
import { otpVerifySchema, patchMeRequestSchema, phoneSchema } from "./index.ts";

describe("phone numbers", () => {
  it.each([
    ["9876543210", "+919876543210"],
    ["+91 98765 43210", "+919876543210"],
    ["+44 (20) 7946-0958", "+442079460958"],
  ])("%s -> %s", (input, out) => {
    expect(phoneSchema.parse(input)).toBe(out);
  });
  it.each(["12345", "abc", "+0123456789", ""])("refuses %j", (input) => {
    expect(phoneSchema.safeParse(input).success).toBe(false);
  });
  it("needs a 6-digit code", () => {
    expect(otpVerifySchema.safeParse({ phone: "9876543210", token: "12345" }).success).toBe(false);
  });
});

describe("PATCH /me", () => {
  it("takes a partial update", () => {
    expect(patchMeRequestSchema.parse({ goal: "  Track spin  " })).toEqual({ goal: "Track spin" });
  });
  it("refuses an empty body, unknown fields and bad values", () => {
    expect(patchMeRequestSchema.safeParse({}).success).toBe(false);
    expect(patchMeRequestSchema.safeParse({ level: 9 }).success).toBe(false);
    expect(patchMeRequestSchema.safeParse({ sessionMinutes: 12 }).success).toBe(false);
    expect(patchMeRequestSchema.safeParse({ timezone: "Mars/Olympus" }).success).toBe(false);
    expect(patchMeRequestSchema.safeParse({ dob: "2999-01-01" }).success).toBe(false);
    expect(patchMeRequestSchema.safeParse({ reminderTime: "25:00" }).success).toBe(false);
  });
});
