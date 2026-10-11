import { describe, expect, it } from "vitest";
import {
  adminProductCreateSchema,
  adminProductUpdateSchema,
  otpRequestSchema,
  otpVerifySchema,
  patchMeRequestSchema,
  phoneSchema,
  programSlugParamsSchema,
  sessionDrillSchema,
  sessionIdParamsSchema,
} from "./index.ts";

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

describe("email sign-in", () => {
  it("takes an email, lower-cased, or a phone, never both", () => {
    expect(otpRequestSchema.parse({ email: " Asha@Example.COM " })).toEqual({
      email: "asha@example.com",
    });
    expect(otpRequestSchema.parse({ phone: "9876543210" })).toEqual({ phone: "+919876543210" });
    expect(otpRequestSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
    expect(otpRequestSchema.safeParse({ email: "a@b.co", phone: "9876543210" }).success).toBe(
      false,
    );
    expect(otpVerifySchema.safeParse({ email: "a@b.co", token: "123456" }).success).toBe(true);
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

describe("content reads (rule 5)", () => {
  const drill = {
    id: "00000000-0000-4000-8000-000000000001",
    order: 1,
    title: "Near–Far Focus Shifts",
    videoProvider: "youtube",
    thumbnailUrl: null,
    instructions: ["Hold the near card at arm's length."],
    targetType: "seconds",
    targetValue: 30,
    targetLabel: "3 × 30 s",
    restSeconds: 15,
    durationMinutes: 4,
    scoreType: "number",
    scoreDirection: "higher",
    scoreUnit: "shifts",
    xp: 10,
    measurement: { slug: "dynamic-visual-acuity", name: "Dynamic Visual Acuity", group: "vision" },
    access: "included",
    coinPrice: 30,
    ppvProductId: null,
    locked: false,
    doneToday: false,
  };
  it("accepts a session drill", () => {
    expect(sessionDrillSchema.safeParse(drill).success).toBe(true);
  });
  it.each(["videoRef", "video_ref", "ref"])("refuses a drill carrying %s", (key) => {
    expect(sessionDrillSchema.safeParse({ ...drill, [key]: "dQw4w9WgXcQ" }).success).toBe(false);
  });
  it("takes a slug or a uuid as route params, nothing else", () => {
    expect(programSlugParamsSchema.safeParse({ slug: "cricket-vision-foundations" }).success).toBe(
      true,
    );
    expect(programSlugParamsSchema.safeParse({ slug: "../etc" }).success).toBe(false);
    expect(sessionIdParamsSchema.safeParse({ id: "1" }).success).toBe(false);
  });
});

describe("admin products", () => {
  const base = { title: "EyeQ Pro · monthly", pricePaise: 29900 };
  it("matches the grant to the kind", () => {
    expect(
      adminProductCreateSchema.safeParse({
        ...base,
        kind: "subscription",
        grants: { scope: "subscription", durationDays: 30 },
      }).success,
    ).toBe(true);
    expect(
      adminProductCreateSchema.safeParse({
        ...base,
        kind: "program",
        grants: { scope: "subscription", durationDays: 30 },
      }).success,
    ).toBe(false);
    expect(
      adminProductCreateSchema.safeParse({ ...base, kind: "program", grants: { scope: "program" } })
        .success,
    ).toBe(false);
    expect(
      adminProductCreateSchema.safeParse({
        ...base,
        kind: "credit_pack",
        grants: { scope: "credits" },
      }).success,
    ).toBe(false);
  });
  it("keeps money in whole paise and refuses unknown fields", () => {
    const ok = {
      ...base,
      kind: "subscription",
      grants: { scope: "subscription", durationDays: 30 },
    };
    expect(adminProductCreateSchema.safeParse({ ...ok, pricePaise: 299.5 }).success).toBe(false);
    expect(adminProductCreateSchema.safeParse({ ...ok, price: 299 }).success).toBe(false);
    expect(adminProductUpdateSchema.safeParse({ kind: "program" }).success).toBe(false);
  });
});
