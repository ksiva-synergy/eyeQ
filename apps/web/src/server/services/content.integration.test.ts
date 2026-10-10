/**
 * Content reads against a real database, as eyeq_api, through the /api/v1 pipeline:
 * GET /programs, GET /programs/:slug, GET /sessions/:id (plan phase 4, section 7).
 * Rule 5: no drill's video reference appears in any response, as a key or a value.
 */
import {
  apiErrorSchema,
  programDetailSchema,
  programSlugParamsSchema,
  programsResponseSchema,
  sessionDetailSchema,
  sessionIdParamsSchema,
} from "@eyeq/api-contract";
import { createDb, type PrismaClient } from "@eyeq/db";
import { seedConfig } from "@eyeq/db/seed";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localAdminUrl, makeAthlete } from "../../../test/db";
import { apiRoute, type Deps } from "../api/pipeline";
import type { Session, SessionVerifier } from "../auth/session";
import { runtimeUrl } from "../db";
import { getProgram, getSession, listPrograms } from "./content";

const url = localAdminUrl();
const describeDb = url ? describe : describe.skip;

type Built = {
  programId: string;
  slug: string;
  sessionId: string;
  drillIds: string[];
  refs: string[];
};

/** A program with one module, one session and the given drills, inserted as the admin. */
async function buildProgram(
  admin: pg.Client,
  opts: { free: boolean; status?: "published" | "draft"; drills: ("included" | "ppv")[] },
): Promise<Built> {
  const tag = crypto.randomUUID().slice(0, 8);
  const slug = `content-test-${tag}`;
  const p = await admin.query<{ id: string }>(
    `insert into programs (slug, title, duration_days, is_free, in_subscription, status)
     values ($1, $2, 1, $3, false, $4) returning id`,
    [slug, `Content test ${tag}`, opts.free, opts.status ?? "published"],
  );
  const programId = p.rows[0]!.id;
  const m = await admin.query<{ id: string }>(
    `insert into modules (program_id, "order", title, unlock_rule) values ($1, 1, 'Module 1', 'immediate') returning id`,
    [programId],
  );
  const s = await admin.query<{ id: string }>(
    `insert into sessions (program_id, module_id, day_number, est_minutes) values ($1, $2, 1, 14) returning id`,
    [programId, m.rows[0]!.id],
  );
  const sessionId = s.rows[0]!.id;
  const drillIds: string[] = [];
  const refs: string[] = [];
  for (const [i, access] of opts.drills.entries()) {
    const ref = `secret-video-${tag}-${i}`;
    const d = await admin.query<{ id: string }>(
      `insert into drills (title, video_provider, video_ref, access) values ($1, 'youtube', $2, $3) returning id`,
      [`Drill ${i + 1}`, ref, access],
    );
    await admin.query(
      `insert into session_drills (session_id, drill_id, "order") values ($1, $2, $3)`,
      [sessionId, d.rows[0]!.id, i + 1],
    );
    drillIds.push(d.rows[0]!.id);
    refs.push(ref);
  }
  return { programId, slug, sessionId, drillIds, refs };
}

describeDb("content reads", () => {
  const admin = new pg.Client({ connectionString: url });
  let api: PrismaClient;
  const sessions = new Map<string, Session>();
  let athlete: string;
  let free: Built;
  let paid: Built;
  let draft: Built;

  const verifier: SessionVerifier = {
    verify: async (req) => sessions.get(req.headers.get("x-test-user") ?? "") ?? null,
  };
  const deps = (): Deps => ({ db: api, verifier });
  const as = (user: string | null) =>
    new Request("http://test/api/v1/x", { headers: user ? { "x-test-user": user } : {} });
  const params = (p: Record<string, string>) => ({ params: Promise.resolve(p) });

  const programsRoute = apiRoute(
    { name: "GET /programs", handler: ({ tx }) => listPrograms(tx) },
    deps,
  );
  const programRoute = apiRoute(
    {
      name: "GET /programs/:slug",
      params: programSlugParamsSchema,
      handler: ({ tx, params: p }) => getProgram(tx, p.slug),
    },
    deps,
  );
  const sessionRoute = apiRoute(
    {
      name: "GET /sessions/:id",
      params: sessionIdParamsSchema,
      handler: ({ tx, params: p }) => getSession(tx, p.id),
    },
    deps,
  );

  const allRefs = () => [...free.refs, ...paid.refs, ...draft.refs];
  const expectNoVideo = (text: string) => {
    expect(text).not.toMatch(/video_?ref/i);
    for (const ref of allRefs()) expect(text).not.toContain(ref);
  };

  beforeAll(async () => {
    await admin.connect();
    // XP and coin prices come from game_config (rule 8); CI runs this before db:seed.
    await seedConfig(admin);
    api = createDb({ connectionString: runtimeUrl("eyeq_api", { DATABASE_URL: url! }), max: 2 });
    athlete = await makeAthlete(admin, { name: "Reader" });
    sessions.set(athlete, { userId: athlete, phone: null, email: null, name: null });
    free = await buildProgram(admin, { free: true, drills: ["included", "ppv"] });
    paid = await buildProgram(admin, { free: false, drills: ["included"] });
    draft = await buildProgram(admin, { free: true, status: "draft", drills: ["included"] });
  });

  afterAll(async () => {
    // Remove the test content (modules, sessions and links cascade). The entitlement and
    // its events stay: they are append-only by design.
    const built = [free, paid, draft];
    await admin.query("delete from programs where id = any($1::uuid[])", [
      built.map((b) => b.programId),
    ]);
    await admin.query("delete from drills where id = any($1::uuid[])", [
      built.flatMap((b) => b.drillIds),
    ]);
    await api.$disconnect();
    await admin.end();
  });

  it("eyeq_api cannot read video_ref even with a raw query", async () => {
    await expect(api.$queryRaw`select video_ref from drills limit 1`).rejects.toThrow(
      /permission denied/,
    );
  });

  it("refuses an anonymous caller", async () => {
    const res = await programsRoute(as(null));
    expect(res.status).toBe(401);
  });

  it("GET /programs lists published programs with access state, never drafts", async () => {
    const res = await programsRoute(as(athlete));
    expect(res.status).toBe(200);
    const text = await res.text();
    expectNoVideo(text);
    const { programs } = programsResponseSchema.parse(JSON.parse(text));
    const ids = programs.map((p) => p.id);
    expect(ids).toContain(free.programId);
    expect(ids).toContain(paid.programId);
    expect(ids).not.toContain(draft.programId);
    expect(programs.find((p) => p.id === free.programId)?.hasAccess).toBe(true);
    expect(programs.find((p) => p.id === paid.programId)?.hasAccess).toBe(false);
  });

  it("GET /programs/:slug returns modules and sessions; drafts and unknown slugs are 404", async () => {
    const res = await programRoute(as(athlete), params({ slug: free.slug }));
    expect(res.status).toBe(200);
    const text = await res.text();
    expectNoVideo(text);
    const detail = programDetailSchema.parse(JSON.parse(text));
    expect(detail.modules[0]?.sessions.map((s) => s.id)).toEqual([free.sessionId]);
    expect(detail.modules[0]?.unlocked).toBeNull();

    for (const slug of [draft.slug, "no-such-program"]) {
      const miss = await programRoute(as(athlete), params({ slug }));
      expect(miss.status).toBe(404);
      expect(apiErrorSchema.parse(await miss.json()).code).toBe("not_found");
    }
    const bad = await programRoute(as(athlete), params({ slug: "Not A Slug!" }));
    expect(bad.status).toBe(400);
  });

  it("GET /sessions/:id gives each drill's lock state and no video reference", async () => {
    const res = await sessionRoute(as(athlete), params({ id: free.sessionId }));
    expect(res.status).toBe(200);
    const text = await res.text();
    expectNoVideo(text);
    const s = sessionDetailSchema.parse(JSON.parse(text));
    expect(s.drills.map((d) => [d.access, d.locked])).toEqual([
      ["included", false],
      ["ppv", true], // a pay-per-view drill stays locked inside a free program
    ]);

    const paidSession = sessionDetailSchema.parse(
      await (await sessionRoute(as(athlete), params({ id: paid.sessionId }))).json(),
    );
    expect(paidSession.program.hasAccess).toBe(false);
    expect(paidSession.drills[0]?.locked).toBe(true);

    expect((await sessionRoute(as(athlete), params({ id: draft.sessionId }))).status).toBe(404);
    expect((await sessionRoute(as(athlete), params({ id: crypto.randomUUID() }))).status).toBe(404);
    expect((await sessionRoute(as(athlete), params({ id: "not-a-uuid" }))).status).toBe(400);
  });

  it("an entitlement unlocks a paid program and its drills (rule 4)", async () => {
    await admin.query(
      `select grant_entitlement($1, 'program', $2, 'admin', now(), null, null, null, null, 'content test')`,
      [athlete, paid.programId],
    );
    const s = sessionDetailSchema.parse(
      await (await sessionRoute(as(athlete), params({ id: paid.sessionId }))).json(),
    );
    expect(s.program.hasAccess).toBe(true);
    expect(s.drills[0]?.locked).toBe(false);
  });
});
