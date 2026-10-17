import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createApiClient } from "./client.ts";

type Call = { url: string; init: RequestInit };

function fakeFetch(answers: Array<{ status: number; body: unknown }>, calls: Call[]) {
  return (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const a = answers.shift() ?? { status: 500, body: null };
    return new Response(JSON.stringify(a.body), { status: a.status });
  }) as unknown as typeof fetch;
}

const header = (c: Call, name: string) => new Headers(c.init.headers).get(name);
const thing = z.object({ id: z.string() });

describe("createApiClient", () => {
  it("sends the bearer token and validates the answer", async () => {
    const calls: Call[] = [];
    const api = createApiClient({
      baseUrl: "https://app.test/",
      accessToken: async () => "tok",
      newKey: () => "k",
      fetch: fakeFetch([{ status: 200, body: { id: "a" } }], calls),
    });
    const r = await api.get("/api/v1/me", thing);
    expect(r).toEqual({ ok: true, data: { id: "a" } });
    expect(calls[0]!.url).toBe("https://app.test/api/v1/me");
    expect(header(calls[0]!, "authorization")).toBe("Bearer tok");
    expect(header(calls[0]!, "idempotency-key")).toBeNull();
  });

  it("puts an Idempotency-Key on /api/v1 mutations only", async () => {
    const calls: Call[] = [];
    const api = createApiClient({
      baseUrl: "https://app.test",
      newKey: () => "fresh",
      fetch: fakeFetch(
        [
          { status: 200, body: { id: "a" } },
          { status: 200, body: { id: "b" } },
          { status: 200, body: { id: "c" } },
        ],
        calls,
      ),
    });
    await api.post("/api/v1/completions", thing, {});
    await api.post("/api/v1/completions", thing, {}, { idempotencyKey: "same" });
    await api.post("/api/auth/otp", thing, { phone: "9000000001" }, { anonymous: true });
    expect(calls.map((c) => header(c, "idempotency-key"))).toEqual(["fresh", "same", null]);
  });

  it("refreshes once on a 401 and sends the request again", async () => {
    const calls: Call[] = [];
    let token = "old";
    let refreshes = 0;
    const api = createApiClient({
      baseUrl: "https://app.test",
      accessToken: async () => token,
      onUnauthorized: async () => {
        refreshes++;
        token = "new";
        return true;
      },
      newKey: () => "k",
      fetch: fakeFetch(
        [
          { status: 401, body: { code: "unauthenticated", message: "", details: null } },
          { status: 200, body: { id: "a" } },
        ],
        calls,
      ),
    });
    const r = await api.get("/api/v1/me", thing);
    expect(r.ok).toBe(true);
    expect(refreshes).toBe(1);
    expect(calls.map((c) => header(c, "authorization"))).toEqual(["Bearer old", "Bearer new"]);
  });

  it("answers the server's error code, bad_response and network", async () => {
    const calls: Call[] = [];
    const api = createApiClient({
      baseUrl: "https://app.test",
      newKey: () => "k",
      fetch: fakeFetch(
        [
          { status: 429, body: { code: "rate_limited", message: "", details: { a: 1 } } },
          { status: 200, body: { nope: true } },
        ],
        calls,
      ),
    });
    expect(await api.get("/api/v1/me", thing)).toEqual({
      ok: false,
      status: 429,
      code: "rate_limited",
      details: { a: 1 },
    });
    const bad = await api.get("/api/v1/me", thing);
    expect(bad.ok === false && bad.code).toBe("bad_response");
    const offline = createApiClient({
      baseUrl: "https://app.test",
      newKey: () => "k",
      fetch: (async () => {
        throw new TypeError("Network request failed");
      }) as unknown as typeof fetch,
    });
    expect(await offline.get("/api/v1/me", thing)).toEqual({
      ok: false,
      status: 0,
      code: "network",
      details: null,
    });
  });
});
