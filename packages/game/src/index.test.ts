import { describe, expect, it } from "vitest";
import { roundHalfUp } from "./index.js";

describe("roundHalfUp", () => {
  it("rounds .5 up, as the XP multiplier rule requires (71.5 -> 72)", () => {
    expect(roundHalfUp(71.5)).toBe(72);
    expect(roundHalfUp(97.5)).toBe(98);
    expect(roundHalfUp(71.4)).toBe(71);
  });
});
