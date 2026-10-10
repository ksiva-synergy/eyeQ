import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it.each([
    ["/admin", "/admin"],
    ["/admin/products?x=1", "/admin/products?x=1"],
    [null, "/app"],
    ["", "/app"],
    ["https://evil.example", "/app"],
    ["//evil.example", "/app"],
    ["/\\evil.example", "/app"],
    ["admin", "/app"],
  ])("%j -> %s", (input, out) => {
    expect(safeNext(input)).toBe(out);
  });
});
