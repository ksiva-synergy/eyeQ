/**
 * The program builder against a real database as eyeq_service (plan phase 4): the
 * acceptance flow at the API level. Build two modules, three sessions and five drills
 * from pasted links, reorder, duplicate, refuse an unpublishable program with the reason,
 * publish, and find it in the athlete catalogue. Links go through the offline stub checker.
 */
import {
  builderDrillSchema,
  builderIdParamsSchema,
  builderProgramSchema,
  bulkPasteResponseSchema,
  bulkPasteSchema,
  drillUpdateSchema,
  linkCheckRequestSchema,
  linkCheckResultSchema,
  moduleCreateSchema,
  programCreateSchema,
  programUpdateSchema,
  reorderSchema,
  sessionCreateSchema,
  sessionDrillAddSchema,
  type BuilderProgram,
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
  addSessionDrill,
  bulkPaste,
  checkLink,
  createModule,
  createProgram,
  createSession,
  deleteSession,
  duplicateSession,
  getProgram,
  publishProgram,
  reorderProgram,
  updateDrill,
  updateProgram,
} from "./builder";
import { stubChecker } from "./link-check";

const url = localAdminUrl();
const describeDb = url ? describe : describe.skip;

describeDb("/api/admin program builder", () => {
  const admin = new pg.Client({ connectionString: url });
  let service: PrismaClient;
  const sessions = new Map<string, Session>();
  const tag = crypto.randomUUID().slice(0, 8);
  let coach: string;
  let athlete: string;
  let program: BuilderProgram;
  let n = 0;

  const verifier: SessionVerifier = {
    verify: async (req) => sessions.get(req.headers.get("x-test-user") ?? "") ?? null,
  };
  const deps = (): Deps => ({ db: service, verifier });
  const call = async (
    route: (req: Request, ctx?: { params: Promise<Record<string, string>> }) => Promise<Response>,
    opts: { body?: unknown; params?: Record<string, string>; method?: string; user?: string } = {},
  ) => {
    const res = await route(
      new Request("http://test/api/admin/x", {
        method: opts.method ?? "POST",
        headers: {
          "x-test-user": opts.user ?? coach,
          "content-type": "application/json",
          "idempotency-key": `builder-${tag}-${++n}`,
        },
        ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
      }),
      { params: Promise.resolve(opts.params ?? {}) },
    );
    return { status: res.status, json: (await res.json()) as unknown };
  };
  const tree = (json: unknown) => (program = builderProgramSchema.parse(json));

  const create = adminRoute(
    {
      name: "POST /admin/programs",
      body: programCreateSchema,
      mutation: true,
      status: 201,
      handler: ({ tx, body, audit }) => createProgram(tx, body, audit),
    },
    deps,
  );
  const get = adminRoute(
    {
      name: "GET /admin/programs/:id",
      params: builderIdParamsSchema,
      handler: ({ tx, params }) => getProgram(tx, params.id),
    },
    deps,
  );
  const update = adminRoute(
    {
      name: "PATCH /admin/programs/:id",
      params: builderIdParamsSchema,
      body: programUpdateSchema,
      mutation: true,
      handler: ({ tx, params, body, audit }) => updateProgram(tx, params.id, body, audit),
    },
    deps,
  );
  const addModule = adminRoute(
    {
      name: "POST /admin/programs/:id/modules",
      params: builderIdParamsSchema,
      body: moduleCreateSchema,
      mutation: true,
      status: 201,
      handler: ({ tx, params, body, audit }) => createModule(tx, params.id, body, audit),
    },
    deps,
  );
  const addSession = adminRoute(
    {
      name: "POST /admin/modules/:id/sessions",
      params: builderIdParamsSchema,
      body: sessionCreateSchema,
      mutation: true,
      status: 201,
      handler: ({ tx, params, body, audit }) => createSession(tx, params.id, body, audit),
    },
    deps,
  );
  const paste = adminRoute(
    {
      name: "POST /admin/sessions/:id/drills/bulk",
      params: builderIdParamsSchema,
      body: bulkPasteSchema,
      mutation: true,
      status: 201,
      handler: ({ tx, params, body, audit }) =>
        bulkPaste(tx, stubChecker, params.id, body.links, audit),
    },
    deps,
  );
  const addDrill = adminRoute(
    {
      name: "POST /admin/sessions/:id/drills",
      params: builderIdParamsSchema,
      body: sessionDrillAddSchema,
      mutation: true,
      status: 201,
      handler: ({ tx, params, body, audit }) =>
        addSessionDrill(tx, stubChecker, params.id, body, audit),
    },
    deps,
  );
  const editDrill = adminRoute(
    {
      name: "PATCH /admin/drills/:id",
      params: builderIdParamsSchema,
      body: drillUpdateSchema,
      mutation: true,
      handler: ({ tx, params, body, audit }) =>
        updateDrill(tx, stubChecker, params.id, body, audit),
    },
    deps,
  );
  const reorder = adminRoute(
    {
      name: "POST /admin/programs/:id/reorder",
      params: builderIdParamsSchema,
      body: reorderSchema,
      mutation: true,
      handler: ({ tx, params, body, audit }) => reorderProgram(tx, params.id, body, audit),
    },
    deps,
  );
  const duplicate = adminRoute(
    {
      name: "POST /admin/sessions/:id/duplicate",
      params: builderIdParamsSchema,
      mutation: true,
      status: 201,
      handler: ({ tx, params, audit }) => duplicateSession(tx, params.id, audit),
    },
    deps,
  );
  const removeSession = adminRoute(
    {
      name: "DELETE /admin/sessions/:id",
      params: builderIdParamsSchema,
      mutation: true,
      handler: ({ tx, params, audit }) => deleteSession(tx, params.id, audit),
    },
    deps,
  );
  const publish = adminRoute(
    {
      name: "POST /admin/programs/:id/publish",
      params: builderIdParamsSchema,
      mutation: true,
      handler: ({ tx, params, audit }) => publishProgram(tx, params.id, audit),
    },
    deps,
  );
  const linkCheck = adminRoute(
    {
      name: "POST /admin/link-check",
      body: linkCheckRequestSchema,
      handler: ({ body }) => checkLink(stubChecker, body.url),
    },
    deps,
  );

  const sessionIds = () => program.modules.flatMap((m) => m.sessions.map((s) => s.id));
  const days = () => program.modules.flatMap((m) => m.sessions.map((s) => s.dayNumber));
  const auditActions = async () =>
    (
      await admin.query<{ action: string }>(
        `select action from audit_log where actor_id = $1 order by created_at, id`,
        [coach],
      )
    ).rows.map((r) => r.action);

  beforeAll(async () => {
    await admin.connect();
    await seedConfig(admin);
    service = createDb({
      connectionString: runtimeUrl("eyeq_service", { DATABASE_URL: url! }),
      max: 2,
    });
    coach = await makeAthlete(admin, { name: `Coach ${tag}` });
    athlete = await makeAthlete(admin, { name: `Athlete ${tag}` });
    await admin.query("select grant_admin_for($1, 'coach')", [coach]);
    for (const id of [coach, athlete])
      sessions.set(id, { userId: id, phone: null, email: null, name: null });
  });

  afterAll(async () => {
    if (program) {
      const drills = await admin.query<{ drill_id: string }>(
        "select distinct drill_id from session_drills sd join sessions s on s.id = sd.session_id where s.program_id = $1",
        [program.id],
      );
      await admin.query("delete from enrollments where program_id = $1", [program.id]);
      await admin.query("delete from programs where id = $1", [program.id]);
      await admin.query("delete from drills where id = any($1::uuid[])", [
        drills.rows.map((r) => r.drill_id),
      ]);
    }
    await service.$disconnect();
    await admin.end();
  });

  it("refuses an athlete", async () => {
    expect((await call(create, { user: athlete, body: { title: "Nope" } })).status).toBe(403);
  });

  it("creates a draft with a slug from the title", async () => {
    const r = await call(create, { body: { title: `Builder Test ${tag}`, durationDays: 4 } });
    expect(r.status).toBe(201);
    tree(r.json);
    expect(program).toMatchObject({ slug: `builder-test-${tag}`, status: "draft", modules: [] });
    expect(program.check.problems).toEqual([{ code: "no_modules" }, { code: "no_price" }]);
  });

  it("builds two modules and three sessions with days in order", async () => {
    tree(
      (
        await call(addModule, {
          params: { id: program.id },
          body: { title: "Foundations", unlockRule: "immediate" },
        })
      ).json,
    );
    tree((await call(addModule, { params: { id: program.id }, body: { title: "Speed" } })).json);
    const [m1, m2] = program.modules;
    tree((await call(addSession, { params: { id: m1!.id }, body: { title: "Day one" } })).json);
    tree((await call(addSession, { params: { id: m2!.id }, body: {} })).json);
    tree((await call(addSession, { params: { id: m1!.id }, body: { title: "Day two" } })).json);
    expect(program.modules.map((m) => [m.order, m.sessions.map((s) => s.title)])).toEqual([
      [1, ["Day one", "Day two"]],
      [2, [null]],
    ]);
    expect(days()).toEqual([1, 2, 3]);
  });

  it("bulk paste adds one drill per link, keeps broken ones, and lists lines that are not links", async () => {
    const [s1, s2] = program.modules[0]!.sessions;
    const r = await call(paste, {
      params: { id: s1!.id },
      body: {
        links:
          "https://youtu.be/aaaaaaaaaa1\n\nhttps://www.youtube.com/watch?v=aaaaaaaaaa2\nnot a link\nhttps://youtu.be/deadvideo01",
      },
    });
    expect(r.status).toBe(201);
    const out = bulkPasteResponseSchema.parse(r.json);
    expect(out.added.map((a) => [a.line, a.linkStatus])).toEqual([
      [1, "ok"],
      [3, "ok"],
      [5, "broken"],
    ]);
    expect(out.rejected).toEqual([{ line: 4, text: "not a link", reason: "unsupported" }]);
    await call(paste, {
      params: { id: s2!.id },
      body: { links: "https://drive.google.com/file/d/1DriveFileAbcd/view" },
    });
    const s3 = program.modules[1]!.sessions[0]!;
    tree(
      (
        await call(addDrill, {
          params: { id: s3.id },
          body: {
            drill: { videoUrl: "https://youtu.be/aaaaaaaaaa5", title: "Saccade ladder", xp: 15 },
          },
        })
      ).json,
    );
    tree((await call(get, { method: "GET", params: { id: program.id } })).json);
    expect(program.modules.flatMap((m) => m.sessions.flatMap((s) => s.drills))).toHaveLength(5);
  });

  it("a reused drill shows every session it is in", async () => {
    const first = program.modules[0]!.sessions[0]!.drills[0]!;
    const s3 = program.modules[1]!.sessions[0]!;
    tree((await call(addDrill, { params: { id: s3.id }, body: { drillId: first.id } })).json);
    const placed = program.modules
      .flatMap((m) => m.sessions.flatMap((s) => s.drills))
      .filter((d) => d.id === first.id);
    expect(placed).toHaveLength(2);
    expect(placed[0]!.usedIn.map((u) => u.dayNumber)).toEqual([1, 3]);
    expect(
      (await call(addDrill, { params: { id: s3.id }, body: { drillId: first.id } })).status,
    ).toBe(409);
  });

  it("refuses to publish with every reason: the broken link and the missing price", async () => {
    const r = await call(publish, { params: { id: program.id } });
    expect(r.status).toBe(409);
    const details = (
      r.json as { details: { problems: { code: string; reason?: string; day?: number }[] } }
    ).details;
    expect(details.problems).toEqual(
      expect.arrayContaining([
        { code: "no_price" },
        expect.objectContaining({ code: "video_broken", reason: "not_found", day: 1 }),
      ]),
    );
    const status = await admin.query("select status from programs where id = $1", [program.id]);
    expect(status.rows[0].status).toBe("draft");
  });

  it("reorders: modules swap, a drill moves between sessions, days follow", async () => {
    const [m1, m2] = program.modules;
    const [s1, s2] = m1!.sessions;
    const s3 = m2!.sessions[0]!;
    const moved = s1!.drills.at(-1)!.id;
    const body = {
      modules: [
        { id: m2!.id, sessions: [{ id: s3.id, drillIds: s3.drills.map((d) => d.id) }] },
        {
          id: m1!.id,
          sessions: [
            { id: s2!.id, drillIds: [moved, ...s2!.drills.map((d) => d.id)] },
            {
              id: s1!.id,
              drillIds: s1!.drills
                .slice(0, -1)
                .map((d) => d.id)
                .reverse(),
            },
          ],
        },
      ],
    };
    const r = await call(reorder, { params: { id: program.id }, body });
    expect(r.status).toBe(200);
    tree(r.json);
    expect(program.modules.map((m) => m.title)).toEqual(["Speed", "Foundations"]);
    expect(sessionIds()).toEqual([s3.id, s2!.id, s1!.id]);
    expect(days()).toEqual([1, 2, 3]);
    expect(program.modules[1]!.sessions[0]!.drills.map((d) => [d.id, d.order])).toEqual([
      [moved, 1],
      [s2!.drills[0]!.id, 2],
    ]);

    const missing = { modules: [body.modules[0]!] };
    expect((await call(reorder, { params: { id: program.id }, body: missing })).status).toBe(400);
    const lost = structuredClone(body);
    lost.modules[1]!.sessions[1]!.drillIds.pop();
    expect((await call(reorder, { params: { id: program.id }, body: lost })).status).toBe(400);
  });

  it("duplicates a session straight after the original, reusing its drills", async () => {
    const original = program.modules[1]!.sessions[0]!;
    const r = await call(duplicate, { params: { id: original.id } });
    expect(r.status).toBe(201);
    tree(r.json);
    const [a, b] = program.modules[1]!.sessions;
    expect(a!.id).toBe(original.id);
    expect(b!.drills.map((d) => d.id)).toEqual(original.drills.map((d) => d.id));
    expect(days()).toEqual([1, 2, 3, 4]);
    // Four sessions in a four-day program is fine; a fifth would not be.
    expect(program.check.problems.map((p) => p.code)).not.toContain("too_many_sessions");
    tree((await call(removeSession, { method: "DELETE", params: { id: b!.id } })).json);
    expect(days()).toEqual([1, 2, 3]);
  });

  it("a session athletes have used cannot be deleted", async () => {
    const s = program.modules[0]!.sessions[0]!;
    await admin.query(
      `insert into enrollments (user_id, program_id, last_completed_session_id, start_local_date) values ($1, $2, $3, current_date)`,
      [athlete, program.id, s.id],
    );
    expect((await call(removeSession, { method: "DELETE", params: { id: s.id } })).status).toBe(
      409,
    );
  });

  it("the drill editor fixes the link; a free program then publishes and reaches the catalogue", async () => {
    const broken = program.modules
      .flatMap((m) => m.sessions.flatMap((s) => s.drills))
      .find((d) => d.linkStatus === "broken")!;
    const r = await call(editDrill, {
      method: "PATCH",
      params: { id: broken.id },
      body: {
        videoUrl: "https://youtu.be/aaaaaaaaaa9",
        title: "Near-far focus",
        instructions: ["Hold the card", "Shift focus"],
      },
    });
    expect(r.status).toBe(200);
    const d = builderDrillSchema.parse(r.json);
    expect(d).toMatchObject({
      linkStatus: "ok",
      videoUrl: "https://youtu.be/aaaaaaaaaa9",
      videoDurationSeconds: 180,
    });

    tree(
      (await call(update, { method: "PATCH", params: { id: program.id }, body: { isFree: true } }))
        .json,
    );
    expect(program.check.ok).toBe(true);
    // A Drive drill in a free program is not paid: no warning.
    expect(program.check.warnings).toEqual([]);

    const pub = await call(publish, { params: { id: program.id } });
    expect(pub.status).toBe(200);
    expect(builderProgramSchema.parse(pub.json).status).toBe("published");
    const catalogue = await admin.query<{ v: { id: string }[] }>(
      "select catalog_programs_for($1) as v",
      [athlete],
    );
    expect(catalogue.rows[0]!.v.map((p) => p.id)).toContain(program.id);
  });

  it("checks a link without saving it", async () => {
    const ok = linkCheckResultSchema.parse(
      (await call(linkCheck, { body: { url: "https://youtu.be/aaaaaaaaaa7" } })).json,
    );
    expect(ok).toMatchObject({ provider: "youtube", ref: "aaaaaaaaaa7", status: "ok" });
    const bad = linkCheckResultSchema.parse(
      (await call(linkCheck, { body: { url: "https://vimeo.com/1" } })).json,
    );
    expect(bad).toMatchObject({ provider: null, status: "broken", reason: "unsupported" });
  });

  it("every change was audited, and no audit row carries a video reference", async () => {
    const actions = await auditActions();
    for (const a of [
      "program.create",
      "module.create",
      "session.create",
      "session.bulk_paste",
      "drill.create",
      "session.drill_add",
      "program.reorder",
      "session.duplicate",
      "session.delete",
      "drill.update",
      "program.update",
      "program.publish",
    ])
      expect(actions).toContain(a);
    const leaked = await admin.query(
      "select count(*)::int as n from audit_log where actor_id = $1 and (before::text like '%video_ref%' or after::text like '%video_ref%')",
      [coach],
    );
    expect(leaked.rows[0].n).toBe(0);
  });
});
