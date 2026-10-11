import { afterEach, describe, expect, it, vi } from "vitest";
import { clientId } from "./client-id";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("clientId", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses crypto.randomUUID when the context has it", () => {
    expect(clientId()).toMatch(UUID_V4);
  });

  it("still makes a v4 UUID outside a secure context, where randomUUID is missing", () => {
    vi.stubGlobal("crypto", { getRandomValues: crypto.getRandomValues.bind(crypto) });
    const ids = new Set(Array.from({ length: 200 }, () => clientId()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(UUID_V4);
  });
});
