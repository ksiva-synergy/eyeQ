import { describe, expect, it } from "vitest";
import { classify, errorKey, shown } from "./sign-in";

describe("sign-in helpers", () => {
  it("tells a phone from an email, and refuses a login name", () => {
    expect(classify(" 98400 00005 ")).toEqual({ phone: "98400 00005" });
    expect(classify("a@b.in")).toEqual({ email: "a@b.in" });
    expect(classify("qa-master")).toBeNull();
    expect(classify("  ")).toBeNull();
  });
  it("shows an Indian number grouped with +91", () => {
    expect(shown({ phone: "919840000005" })).toBe("+91 98400 00005");
    expect(shown({ phone: "+44 7700 900123" })).toBe("+44 7700 900123");
  });
  it("maps a lost connection to its own message", () => {
    expect(errorKey("network")).toBe("auth.error.network");
    expect(errorKey("weird")).toBe("auth.error.generic");
  });
});
