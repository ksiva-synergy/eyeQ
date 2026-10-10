/**
 * Coach admin athletes against a real database as eyeq_service (plan phase 4): list with
 * search and plan filter, CSV export, athlete page, manual grant and revoke written with
 * source = admin and audited. Rule 11: masked phone, no date of birth anywhere.
 */
import {
  adminAthleteDetailSchema,
  adminAthleteParamsSchema,
  adminAthletesResponseSchema,
  adminEntitlementParamsSchema,
  adminEntitlementSchema,
  adminGrantSchema,
  adminRevokeSchema,
} from "@eyeq/api-contract";
import { createDb, type PrismaClient } from "@eyeq/db";
import { seedConfig } from "@eyeq/db/seed";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localAdminUrl, makeAthlete } from "../../../../test/db";
import { adminRoute } from "../../api/admin";
import type { Deps } from "../../api/pipeline";
import type { Session, SessionVerifier } from "../../auth/session";
import { runtimeUrl } from "../../db";
import {
  exportAthletesCsv,
  getAthlete,
  grantEntitlement,
  listAthletes,
  readAthletesQuery,
  revokeEntitlement,
} from "./athletes";

const url = localAdminUrl();
const describeDb = url ? describe : describe.skip;

describeDb("/api/admin/athletes", () => {
  const admin = new pg.Client({ connectionString: url });
  let service: PrismaClient;
  const sessions = new Map<string, Session>();
  const tag = crypto.randomUUID().slice(0, 8);
  const digits = String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
  const phone = `+9190${digits}`;
  let coach: string;
  let asha: string;
  let other: string;
  let programId: string;

  const verifier: SessionVerifier = {
    verify: async (req) => sessions.get(req.headers.get("x-test-user") ?? "") ?? null,
  };
  const deps = (): Deps => ({ db: service, verifier });
  const req = (
    user: string,
    path = "/api/admin/athletes",
    init: { method?: string; body?: unknown; key?: string } = {},
  ) =>
    new Request(`http://test${path}`, {
      method: init.method ?? "GET",
      headers: {
        "x-test-user": user,
        "content-type": "application/json",
        ...(init.key ? { "idempotency-key": init.key } : {}),
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
  const params = (p: Record<string, string>) => ({ params: Promise.resolve(p) });
  const hasAccess = async () =>
    (
      await admin.query<{ ok: boolean }>("select has_access($1, 'program', $2) as ok", [
        asha,
        programId,
      ])
    ).rows[0]!.ok;
  const auditRows = async (target: string) =>
    (
      await admin.query(
        "select action, actor_id, before, after from audit_log where target_id = $1 order by created_at, id",
        [target],
      )
    ).rows;

  const list = adminRoute(
    {
      name: "GET /admin/athletes",
      handler: ({ tx, req: r }) => listAthletes(tx, readAthletesQuery(r)),
    },
    deps,
  );
  const csv = adminRoute(
    {
      name: "GET /admin/athletes/export",
      csv: { filename: "eyeq-athletes.csv" },
      handler: ({ tx, req: r, audit }) => exportAthletesCsv(tx, readAthletesQuery(r), audit),
    },
    deps,
  );
  const detail = adminRoute(
    {
      name: "GET /admin/athletes/:id",
      params: adminAthleteParamsSchema,
      handler: ({ tx, params: p }) => getAthlete(tx, p.id),
    },
    deps,
  );
  const grant = adminRoute(
    {
      name: "POST /admin/athletes/:id/entitlements",
      params: adminAthleteParamsSchema,
      body: adminGrantSchema,
      mutation: true,
      status: 201,
      handler: ({ tx, admin: a, params: p, body, audit }) =>
        grantEntitlement(tx, a, p.id, body, audit),
    },
    deps,
  );
  const revoke = adminRoute(
    {
      name: "POST /admin/athletes/:id/entitlements/:entitlementId/revoke",
      params: adminEntitlementParamsSchema,
      body: adminRevokeSchema,
      mutation: true,
      handler: ({ tx, admin: a, params: p, body, audit }) =>
        revokeEntitlement(tx, a, p.id, p.entitlementId, body.reason, audit),
    },
    deps,
  );
  const grantReq = (body: unknown, key: string) =>
    grant(
      req(coach, `/api/admin/athletes/${asha}/entitlements`, { method: "POST", body, key }),
      params({ id: asha }),
    );

  beforeAll(async () => {
    await admin.connect();
    await seedConfig(admin);
    service = createDb({
      connectionString: runtimeUrl("eyeq_service", { DATABASE_URL: url! }),
      max: 2,
    });
    coach = await makeAthlete(admin, { name: `Coach ${tag}` });
    asha = await makeAthlete(admin, { name: `Asha ${tag}`, phone });
    // A name a spreadsheet would run as a formula.
    other = await makeAthlete(admin, { name: `=HYPERLINK ${tag}` });
    await admin.query("update profiles set dob = '2012-05-01', sport = 'cricket' where id = $1", [
      asha,
    ]);
    await admin.query("select grant_admin_for($1, 'coach')", [coach]);
    for (const id of [coach, asha, other])
      sessions.set(id, { userId: id, phone: null, email: null, name: null });
    const p = await admin.query<{ id: string }>(
      `insert into programs (slug, title, duration_days, is_free, in_subscription, status)
       values ($1, $2, 7, false, false, 'published') returning id`,
      [`athletes-test-${tag}`, `Athletes test ${tag}`],
    );
    programId = p.rows[0]!.id;
  });

  afterAll(async () => {
    // Entitlements, their events and audit rows are append-only and stay.
    await service.$disconnect();
    await admin.end();
  });

  it("refuses an athlete", async () => {
    expect((await list(req(asha))).status).toBe(403);
    expect((await csv(req(asha, "/api/admin/athletes/export"))).status).toBe(403);
  });

  it("lists by name with a masked phone and no date of birth", async () => {
    const res = await list(req(coach, `/api/admin/athletes?search=${tag}`));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain(digits);
    expect(text).not.toContain("2012-05-01");
    expect(text).not.toMatch(/dob/i);
    const body = adminAthletesResponseSchema.parse(JSON.parse(text));
    expect(body.total).toBe(3);
    const row = body.athletes.find((a) => a.id === asha)!;
    expect(row.phoneMasked).toBe(`+91 ••••• •${digits.slice(-4)}`);
    expect(row.plan).toBe("free");
  });

  it("finds an athlete by the last digits of their phone", async () => {
    const res = await list(req(coach, `/api/admin/athletes?search=${digits.slice(-6)}`));
    const body = adminAthletesResponseSchema.parse(await res.json());
    expect(body.athletes.map((a) => a.id)).toContain(asha);
  });

  it("refuses a plan outside pro, program and free", async () => {
    expect((await list(req(coach, "/api/admin/athletes?plan=gold"))).status).toBe(400);
  });

  it("exports CSV with masked phones, neutralised formulas, and an audit row", async () => {
    const res = await csv(req(coach, `/api/admin/athletes/export?search=${tag}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/csv/);
    expect(res.headers.get("content-disposition")).toContain("eyeq-athletes.csv");
    const text = await res.text();
    const lines = text.trim().split("\r\n");
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain('"Phone (masked)"');
    // A leading + is neutralised like = so Excel keeps the masked phone as text.
    expect(text).toContain(`"'+91 ••••• •${digits.slice(-4)}"`);
    expect(text).not.toContain(digits);
    expect(text).toContain(`"'=HYPERLINK ${tag}"`);
    const rows = (
      await admin.query(
        "select actor_id, after from audit_log where action = 'athletes.export' and after->>'search' = $1",
        [tag],
      )
    ).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actor_id: coach, after: { rows: 3 } });
  });

  it("the athlete page: 404 for an unknown id, 400 for a bad one", async () => {
    const res = await detail(req(coach), params({ id: asha }));
    expect(res.status).toBe(200);
    const d = adminAthleteDetailSchema.parse(await res.json());
    expect(d.isMinor).toBe(true);
    expect(d.entitlements).toEqual([]);
    expect((await detail(req(coach), params({ id: crypto.randomUUID() }))).status).toBe(404);
    expect((await detail(req(coach), params({ id: "nope" }))).status).toBe(400);
  });

  it("refuses a grant for a missing scope or a subscription with a scope id", async () => {
    const missing = await grantReq(
      { scope: "program", scopeId: crypto.randomUUID(), reason: "trial" },
      `grant-missing-${tag}`,
    );
    expect(missing.status).toBe(400);
    const sub = await grantReq(
      { scope: "subscription", scopeId: programId, reason: "trial" },
      `grant-sub-${tag}`,
    );
    expect(sub.status).toBe(400);
    expect(await hasAccess()).toBe(false);
  });

  it("a manual grant unlocks the program, with source admin, the reason, and an audit row", async () => {
    const body = { scope: "program", scopeId: programId, reason: "comp for the trial" };
    const res = await grantReq(body, `grant-${tag}`);
    expect(res.status).toBe(201);
    const e = adminEntitlementSchema.parse(await res.json());
    expect(e).toMatchObject({ source: "admin", status: "active", active: true, endsAt: null });
    expect(e.events[0]).toMatchObject({
      change: "granted",
      reason: "comp for the trial",
      adminId: coach,
    });
    expect(await hasAccess()).toBe(true);
    const rows = await auditRows(e.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "entitlement.grant", actor_id: coach, before: null });
    expect(rows[0].after).toMatchObject({ userId: asha, scopeId: programId });

    // The same key replays; nothing new is written.
    const again = await grantReq(body, `grant-${tag}`);
    expect(again.headers.get("idempotent-replayed")).toBe("true");
    expect(await auditRows(e.id)).toHaveLength(1);

    const list2 = adminAthletesResponseSchema.parse(
      await (await list(req(coach, `/api/admin/athletes?search=${tag}&plan=program`))).json(),
    );
    expect(list2.athletes.map((a) => a.id)).toEqual([asha]);
  });

  it("a second grant for the same scope extends it, audited with before and after", async () => {
    const endsAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const res = await grantReq(
      { scope: "program", scopeId: programId, endsAt, reason: "second grant" },
      `grant-2-${tag}`,
    );
    const e = adminEntitlementSchema.parse(await res.json());
    // Lifetime wins over a dated extension.
    expect(e.endsAt).toBeNull();
    expect(e.events.map((x) => x.change)).toEqual(["granted", "extended"]);
    const rows = await auditRows(e.id);
    expect(rows.map((r) => r.action)).toEqual(["entitlement.grant", "entitlement.extend"]);
    expect(rows[1].before).not.toBeNull();
  });

  it("revoke ends access, keeps the history, and cannot run twice", async () => {
    const d = adminAthleteDetailSchema.parse(
      await (await detail(req(coach), params({ id: asha }))).json(),
    );
    const ent = d.entitlements[0]!;
    const path = `/api/admin/athletes/${asha}/entitlements/${ent.id}/revoke`;
    const res = await revoke(
      req(coach, path, { method: "POST", body: { reason: "trial over" }, key: `revoke-${tag}` }),
      params({ id: asha, entitlementId: ent.id }),
    );
    expect(res.status).toBe(200);
    const e = adminEntitlementSchema.parse(await res.json());
    expect(e).toMatchObject({ status: "ended", active: false });
    expect(e.events.at(-1)).toMatchObject({
      change: "revoked",
      reason: "trial over",
      adminId: coach,
    });
    expect(await hasAccess()).toBe(false);
    expect((await auditRows(ent.id)).map((r) => r.action)).toContain("entitlement.revoke");

    const twice = await revoke(
      req(coach, path, { method: "POST", body: { reason: "again" }, key: `revoke-2-${tag}` }),
      params({ id: asha, entitlementId: ent.id }),
    );
    expect(twice.status).toBe(409);
    // Another athlete's entitlement id does not resolve under this athlete.
    const wrong = await revoke(
      req(coach, `/api/admin/athletes/${other}/entitlements/${ent.id}/revoke`, {
        method: "POST",
        body: { reason: "wrong athlete" },
        key: `revoke-3-${tag}`,
      }),
      params({ id: other, entitlementId: ent.id }),
    );
    expect(wrong.status).toBe(404);
  });
});
