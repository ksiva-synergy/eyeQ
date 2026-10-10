/**
 * The /api/v1 pipeline against a real database, as eyeq_api, with an injected session
 * verifier. Covers phase 2's acceptance check: a request for athlete A cannot return
 * athlete B's rows even when the service code is deliberately wrong (RLS catches it).
 */
import { apiErrorSchema, meResponseSchema, patchMeRequestSchema } from "@eyeq/api-contract";
import { createDb, type PrismaClient } from "@eyeq/db";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localAdminUrl, makeAthlete } from "../../../test/db";
import type { Session, SessionVerifier } from "../auth/session";
import { runtimeUrl } from "../db";
import { getMe, patchMe } from "../services/me";
import { apiRoute, type Deps } from "./pipeline";

const url = localAdminUrl();
const describeDb = url ? describe : describe.skip;

describeDb("/api/v1 pipeline", () => {
  const admin = new pg.Client({ connectionString: url });
  let api: PrismaClient;
  let superuser: PrismaClient;
  const sessions = new Map<string, Session>();
  let a: string;
  let b: string;

  // A test session: the x-test-user header names a user id the test created.
  const verifier: SessionVerifier = {
    verify: async (req) => sessions.get(req.headers.get("x-test-user") ?? "") ?? null,
  };
  const deps = (): Deps => ({ db: api, verifier });
  const as = (user: string, init: RequestInit = {}) =>
    new Request("http://test/api/v1/x", {
      ...init,
      headers: { "x-test-user": user, "content-type": "application/json", ...(init.headers ?? {}) },
    });
  const session = (userId: string, extra: Partial<Session> = {}): Session => {
    const s = { userId, phone: null, email: null, name: null, ...extra };
    sessions.set(userId, s);
    return s;
  };

  beforeAll(async () => {
    await admin.connect();
    api = createDb({ connectionString: runtimeUrl("eyeq_api", { DATABASE_URL: url! }), max: 2 });
    superuser = createDb({ connectionString: url!, max: 1 });
    a = await makeAthlete(admin, { name: "Asha (A)" });
    b = await makeAthlete(admin, { name: "Bilal (B)" });
    session(a, { phone: "+919800000101" });
    session(b);
  });

  afterAll(async () => {
    await admin.query(
      "delete from game_config where key = 'rate.api_per_user_per_minute' and note = 'pipeline test'",
    );
    await api.$disconnect();
    await superuser.$disconnect();
    await admin.end();
  });

  it("runs as eyeq_api, never as an admin role", async () => {
    const [row] = await api.$queryRaw<{ u: string }[]>`select current_user as u`;
    expect(row?.u).toBe("eyeq_api");
  });

  it("refuses a request without a verified session, in the one error shape", async () => {
    const get = apiRoute({ name: "GET /me", handler: ({ tx, session: s }) => getMe(tx, s) }, deps);
    const res = await get(new Request("http://test/api/v1/me"));
    expect(res.status).toBe(401);
    const body = apiErrorSchema.parse(await res.json());
    expect(body.code).toBe("unauthenticated");
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });

  it("GET /me returns the caller's profile and never the date of birth", async () => {
    const get = apiRoute({ name: "GET /me", handler: ({ tx, session: s }) => getMe(tx, s) }, deps);
    const res = await get(as(a));
    expect(res.status).toBe(200);
    const me = meResponseSchema.parse(await res.json());
    expect(me.id).toBe(a);
    expect(me.displayName).toBe("Asha (A)");
    expect(me.phone).toBe("+919800000101");
    expect(Object.keys(me)).not.toContain("dob");
  });

  it("creates the profile and user_stats on the first signed-in request", async () => {
    const c = await makeAthlete(admin, { profile: false });
    session(c, { name: "Chitra from Google" });
    const get = apiRoute({ name: "GET /me", handler: ({ tx, session: s }) => getMe(tx, s) }, deps);
    const me = meResponseSchema.parse(await (await get(as(c))).json());
    expect(me.displayName).toBe("Chitra from Google");
    const stats = await admin.query("select 1 from user_stats where user_id = $1", [c]);
    expect(stats.rowCount).toBe(1);
  });

  describe("deliberately wrong service code (RLS is the second line)", () => {
    // Forgets every filter and even asks for B by id, while serving A.
    const leaky = async (tx: Parameters<Parameters<typeof apiRoute>[0]["handler"]>[0]["tx"]) => ({
      allProfiles: (await tx.profiles.findMany({ select: { id: true } })).map((p) => p.id),
      bById: await tx.profiles.findUnique({
        where: { id: b },
        select: { id: true, display_name: true },
      }),
      allStats: (await tx.user_stats.findMany({ select: { user_id: true } })).map((s) => s.user_id),
      rawB: await tx.$queryRaw<{ id: string }[]>`select id from profiles where id = ${b}::uuid`,
    });

    it("returns none of B's rows to A", async () => {
      const route = apiRoute({ name: "GET /leaky", handler: ({ tx }) => leaky(tx) }, deps);
      const res = await route(as(a));
      expect(res.status).toBe(200);
      const out = (await res.json()) as Awaited<ReturnType<typeof leaky>>;
      expect(out.allProfiles).toEqual([a]);
      expect(out.bById).toBeNull();
      expect(out.allStats).toEqual([a]);
      expect(out.rawB).toEqual([]);
    });

    it("cannot change B's profile either", async () => {
      const route = apiRoute(
        {
          name: "PATCH /leaky",
          handler: ({ tx }) =>
            tx.profiles.update({ where: { id: b }, data: { display_name: "pwned" } }),
        },
        deps,
      );
      const res = await route(as(a, { method: "PATCH" }));
      expect(res.status).toBe(404);
      const r = await admin.query<{ display_name: string }>(
        "select display_name from profiles where id = $1",
        [b],
      );
      expect(r.rows[0]?.display_name).toBe("Bilal (B)");
    });

    it("would leak on an admin connection, so the test above is meaningful", async () => {
      const route = apiRoute({ name: "GET /leaky", handler: ({ tx }) => leaky(tx) }, () => ({
        db: superuser,
        verifier,
      }));
      const out = (await (await route(as(a))).json()) as Awaited<ReturnType<typeof leaky>>;
      expect(out.bById?.id).toBe(b);
    });
  });

  describe("PATCH /me", () => {
    const patch = apiRoute(
      {
        name: "PATCH /me",
        body: patchMeRequestSchema,
        idempotent: true,
        handler: ({ tx, session: s, body }) => patchMe(tx, s, body),
      },
      deps,
    );
    const req = (body: unknown, key?: string) =>
      as(a, {
        method: "PATCH",
        body: JSON.stringify(body),
        headers: key ? { "idempotency-key": key } : {},
      });

    it("validates with the contract schema and reports the fields", async () => {
      const res = await patch(req({ sessionMinutes: 12, extra: 1 }, "k-validate-1"));
      expect(res.status).toBe(400);
      const body = apiErrorSchema.parse(await res.json());
      expect(body.code).toBe("validation_failed");
      expect(JSON.stringify(body.details)).toContain("sessionMinutes");
    });

    it("refuses malformed JSON", async () => {
      const res = await patch(
        as(a, { method: "PATCH", body: "{nope", headers: { "idempotency-key": "k-json-01" } }),
      );
      expect(apiErrorSchema.parse(await res.json()).code).toBe("invalid_json");
    });

    it("requires an idempotency key", async () => {
      const res = await patch(req({ goal: "x" }));
      expect(res.status).toBe(400);
      expect(apiErrorSchema.parse(await res.json()).code).toBe("idempotency_key_required");
    });

    it("applies once and replays the first result for a repeat", async () => {
      const key = `k-${crypto.randomUUID()}`;
      const first = await patch(
        req({ goal: "Read the googly", reminderTime: "06:30", dob: "2011-05-04" }, key),
      );
      expect(first.status).toBe(200);
      const me = meResponseSchema.parse(await first.json());
      expect(me.goal).toBe("Read the googly");
      expect(me.reminderTime).toBe("06:30");
      expect(me.isMinor).toBe(true);
      expect(me.hasDob).toBe(true);

      await admin.query("update profiles set goal = 'changed elsewhere' where id = $1", [a]);
      const again = await patch(
        req({ reminderTime: "06:30", dob: "2011-05-04", goal: "Read the googly" }, key),
      );
      expect(again.status).toBe(200);
      expect(again.headers.get("idempotent-replayed")).toBe("true");
      expect(meResponseSchema.parse(await again.json()).goal).toBe("Read the googly");
      const r = await admin.query<{ goal: string }>("select goal from profiles where id = $1", [a]);
      expect(r.rows[0]?.goal).toBe("changed elsewhere");

      const reused = await patch(req({ goal: "something else" }, key));
      expect(reused.status).toBe(422);
      expect(apiErrorSchema.parse(await reused.json()).code).toBe("idempotency_key_reused");
    });

    it("keeps idempotency keys per athlete", async () => {
      const key = `k-${crypto.randomUUID()}`;
      await patch(req({ goal: "A's goal" }, key));
      const asB = apiRoute(
        {
          name: "PATCH /me",
          body: patchMeRequestSchema,
          idempotent: true,
          handler: ({ tx, session: s, body }) => patchMe(tx, s, body),
        },
        deps,
      );
      const res = await asB(
        as(b, {
          method: "PATCH",
          body: JSON.stringify({ goal: "B's goal" }),
          headers: { "idempotency-key": key },
        }),
      );
      expect(res.status).toBe(200);
      expect(meResponseSchema.parse(await res.json()).goal).toBe("B's goal");
    });
  });

  it("rate-limits per athlete from game_config and says when to retry", async () => {
    await admin.query(
      "insert into game_config (key, value, active_from, note) values ('rate.api_per_user_per_minute', '2', now() - interval '1 second', 'pipeline test')",
    );
    const d = await makeAthlete(admin, { name: "Dev" });
    session(d);
    const get = apiRoute({ name: "GET /me", handler: ({ tx, session: s }) => getMe(tx, s) }, deps);
    expect((await get(as(d))).status).toBe(200);
    expect((await get(as(d))).status).toBe(200);
    const third = await get(as(d));
    expect(third.status).toBe(429);
    expect(apiErrorSchema.parse(await third.json()).code).toBe("rate_limited");
    expect(Number(third.headers.get("retry-after"))).toBeGreaterThan(0);
    await admin.query(
      "delete from game_config where key = 'rate.api_per_user_per_minute' and note = 'pipeline test'",
    );
    expect((await get(as(d))).status).toBe(200);
  });
});
