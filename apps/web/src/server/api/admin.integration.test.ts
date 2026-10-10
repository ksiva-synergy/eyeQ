/**
 * The /api/admin pipeline against a real database as eyeq_service (plan phase 4):
 * admins only, every mutation audited in the same transaction, idempotent mutations.
 * Exercised through the products endpoints ("Products, minimal").
 */
import {
  adminProductSchema,
  adminProductsResponseSchema,
  apiErrorSchema,
} from "@eyeq/api-contract";
import { createDb, type PrismaClient } from "@eyeq/db";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localAdminUrl, makeAthlete } from "../../../test/db";
import type { Session, SessionVerifier } from "../auth/session";
import { runtimeUrl } from "../db";
import { createProduct, listProducts, updateProduct } from "../services/admin/products";
import {
  adminProductCreateSchema,
  adminIdParamsSchema,
  adminProductUpdateSchema,
} from "@eyeq/api-contract";
import { adminRoute } from "./admin";
import { ApiError } from "./errors";
import type { Deps } from "./pipeline";

const url = localAdminUrl();
const describeDb = url ? describe : describe.skip;

describeDb("/api/admin pipeline", () => {
  const admin = new pg.Client({ connectionString: url });
  let service: PrismaClient;
  const sessions = new Map<string, Session>();
  let coach: string;
  let athlete: string;
  const created: string[] = [];

  const verifier: SessionVerifier = {
    verify: async (req) => sessions.get(req.headers.get("x-test-user") ?? "") ?? null,
  };
  const deps = (): Deps => ({ db: service, verifier });
  const req = (user: string, init: { method?: string; body?: unknown; key?: string } = {}) =>
    new Request("http://test/api/admin/x", {
      method: init.method ?? "GET",
      headers: {
        "x-test-user": user,
        "content-type": "application/json",
        ...(init.key ? { "idempotency-key": init.key } : {}),
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
  const params = (p: Record<string, string>) => ({ params: Promise.resolve(p) });
  const auditRows = async (id: string) =>
    (
      await admin.query(
        "select action, actor_id, actor_role, before, after from audit_log where target_id = $1 order by created_at",
        [id],
      )
    ).rows;

  const list = adminRoute(
    { name: "GET /admin/products", handler: ({ tx }) => listProducts(tx) },
    deps,
  );
  const create = adminRoute(
    {
      name: "POST /admin/products",
      body: adminProductCreateSchema,
      mutation: true,
      status: 201,
      handler: ({ tx, body, audit }) => createProduct(tx, body, audit),
    },
    deps,
  );
  const update = adminRoute(
    {
      name: "PATCH /admin/products/:id",
      params: adminIdParamsSchema,
      body: adminProductUpdateSchema,
      mutation: true,
      handler: ({ tx, params: p, body, audit }) => updateProduct(tx, p.id, body, audit),
    },
    deps,
  );

  const newProduct = (title: string) => ({
    kind: "subscription",
    title,
    pricePaise: 29900,
    grants: { scope: "subscription", durationDays: 30 },
  });

  beforeAll(async () => {
    await admin.connect();
    service = createDb({
      connectionString: runtimeUrl("eyeq_service", { DATABASE_URL: url! }),
      max: 2,
    });
    coach = await makeAthlete(admin, { name: "Coach" });
    athlete = await makeAthlete(admin, { name: "Athlete" });
    await admin.query("select grant_admin_for($1, 'coach')", [coach]);
    for (const id of [coach, athlete])
      sessions.set(id, { userId: id, phone: null, email: null, name: null });
  });

  afterAll(async () => {
    // Products are never deleted in the app; test rows go, their audit rows stay (append-only).
    if (created.length)
      await admin.query("delete from products where id = any($1::uuid[])", [created]);
    await service.$disconnect();
    await admin.end();
  });

  it("runs as eyeq_service", async () => {
    const [row] = await service.$queryRaw<{ u: string }[]>`select current_user as u`;
    expect(row?.u).toBe("eyeq_service");
  });

  it("refuses a signed-out caller and an athlete", async () => {
    expect((await list(new Request("http://test/api/admin/products"))).status).toBe(401);
    const res = await list(req(athlete));
    expect(res.status).toBe(403);
    expect(apiErrorSchema.parse(await res.json()).code).toBe("forbidden");
  });

  it("a coach creates a product, and the audit row is written with it", async () => {
    const res = await create(
      req(coach, {
        method: "POST",
        body: newProduct("Test Pro · monthly"),
        key: "create-pro-0001",
      }),
    );
    expect(res.status).toBe(201);
    const p = adminProductSchema.parse(await res.json());
    created.push(p.id);
    expect(p.grants).toMatchObject({ scope: "subscription", durationDays: 30 });
    const rows = await auditRows(p.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: "product.create",
      actor_id: coach,
      actor_role: "coach",
      before: null,
    });
    expect(rows[0].after.pricePaise).toBe(29900);
    const db = await admin.query("select grants from products where id = $1", [p.id]);
    expect(db.rows[0].grants).toEqual({ scope: "subscription", duration_days: 30 });
  });

  it("replays a repeated Idempotency-Key without a second product or audit row", async () => {
    const body = newProduct("Test Pro · quarterly");
    const first = adminProductSchema.parse(
      await (await create(req(coach, { method: "POST", body, key: "create-pro-0002" }))).json(),
    );
    created.push(first.id);
    const again = await create(req(coach, { method: "POST", body, key: "create-pro-0002" }));
    expect(again.headers.get("idempotent-replayed")).toBe("true");
    expect(adminProductSchema.parse(await again.json()).id).toBe(first.id);
    const n = await admin.query("select count(*)::int as n from products where title = $1", [
      body.title,
    ]);
    expect(n.rows[0].n).toBe(1);
    expect(await auditRows(first.id)).toHaveLength(1);
  });

  it("updates with before and after in the audit row", async () => {
    const id = created[0]!;
    const res = await update(
      req(coach, {
        method: "PATCH",
        body: { pricePaise: 34900, active: false },
        key: "update-pro-0001",
      }),
      params({ id }),
    );
    expect(res.status).toBe(200);
    expect(adminProductSchema.parse(await res.json())).toMatchObject({
      pricePaise: 34900,
      active: false,
    });
    const rows = await auditRows(id);
    expect(rows.map((r) => r.action)).toEqual(["product.create", "product.update"]);
    expect([rows[1].before.pricePaise, rows[1].after.pricePaise]).toEqual([29900, 34900]);
  });

  it("refuses a grant that does not match the kind, with nothing written", async () => {
    const bad = await create(
      req(coach, {
        method: "POST",
        body: { ...newProduct("Bad"), kind: "program" },
        key: "create-bad-0001",
      }),
    );
    expect(bad.status).toBe(400);
    const id = created[0]!;
    const badUpdate = await update(
      req(coach, {
        method: "PATCH",
        body: { grants: { scope: "credits", credits: 5 } },
        key: "update-bad-0001",
      }),
      params({ id }),
    );
    expect(badUpdate.status).toBe(400);
    expect(await auditRows(id)).toHaveLength(2);
  });

  it("a failing handler rolls back its audit row too", async () => {
    const failing = adminRoute(
      {
        name: "POST /admin/fail",
        mutation: true,
        handler: async ({ audit }) => {
          await audit({ action: "test.fail", targetType: "test", targetId: "rollback-check" });
          throw new ApiError(409, "validation_failed", "fails after auditing");
        },
      },
      deps,
    );
    expect((await failing(req(coach, { method: "POST", key: "fail-rollback-0001" }))).status).toBe(
      409,
    );
    expect(await auditRows("rollback-check")).toHaveLength(0);
  });

  it("lists products for a coach", async () => {
    const res = await list(req(coach));
    const { products } = adminProductsResponseSchema.parse(await res.json());
    expect(products.map((p) => p.id)).toEqual(expect.arrayContaining(created));
  });

  it("an owner-only route refuses a coach", async () => {
    const ownerOnly = adminRoute(
      { name: "GET /admin/owner", ownerOnly: true, handler: async () => ({ ok: true }) },
      deps,
    );
    expect((await ownerOnly(req(coach))).status).toBe(403);
  });
});
