import type { ApiResult, TokenSession } from "@eyeq/api-contract";
import { describe, expect, it } from "vitest";
import { createSessionManager, type TokenStore } from "./session";

function memoryStore(): TokenStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async (k) => data.get(k) ?? null,
    set: async (k, v) => void data.set(k, v),
    delete: async (k) => void data.delete(k),
  };
}

const session = (n: number, expiresAt: number): TokenSession => ({
  userId: "00000000-0000-4000-8000-000000000001",
  accessToken: `access-${n}`,
  refreshToken: `refresh-${n}`,
  expiresAt,
});
const fail = (status: number): ApiResult<TokenSession> => ({
  ok: false,
  status,
  code: status === 0 ? "network" : "unauthenticated",
  details: null,
});

describe("session manager", () => {
  it("keeps tokens in the store and reads them back", async () => {
    const store = memoryStore();
    const a = createSessionManager({ store, refresh: async () => fail(500), now: () => 1000 });
    await a.save(session(1, 5000));
    const b = createSessionManager({ store, refresh: async () => fail(500), now: () => 1000 });
    expect(await b.load()).toEqual(session(1, 5000));
    expect(await b.accessToken()).toBe("access-1");
  });

  it("refreshes before expiry, once for concurrent callers", async () => {
    let calls = 0;
    const m = createSessionManager({
      store: memoryStore(),
      refresh: async (rt) => {
        calls++;
        expect(rt).toBe("refresh-1");
        await new Promise((r) => setTimeout(r, 5));
        return { ok: true, data: session(2, 9000) };
      },
      now: () => 4970,
    });
    await m.save(session(1, 5000));
    const tokens = await Promise.all([m.accessToken(), m.accessToken(), m.refreshNow()]);
    expect(tokens).toEqual(["access-2", "access-2", true]);
    expect(calls).toBe(1);
  });

  it("signs out on the device when the server refuses the refresh", async () => {
    const store = memoryStore();
    const seen: Array<string | null> = [];
    const m = createSessionManager({ store, refresh: async () => fail(401), now: () => 1000 });
    m.subscribe((s) => seen.push(s?.accessToken ?? null));
    await m.save(session(1, 5000));
    expect(await m.refreshNow()).toBe(false);
    expect(m.current()).toBeNull();
    expect(store.data.size).toBe(0);
    expect(seen).toEqual(["access-1", null]);
  });

  it("stays signed in when the refresh cannot reach the server", async () => {
    const m = createSessionManager({
      store: memoryStore(),
      refresh: async () => fail(0),
      now: () => 4990,
    });
    await m.save(session(1, 5000));
    expect(await m.accessToken()).toBe("access-1");
    expect(m.current()?.refreshToken).toBe("refresh-1");
  });
});
