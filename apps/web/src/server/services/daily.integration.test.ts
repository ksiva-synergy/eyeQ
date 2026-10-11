/**
 * The daily loop against a real database, as eyeq_api, through the /api/v1 pipeline
 * (plan phase 5, section 7): enrol, GET /home, GET /drills/:id(/media), POST /completions,
 * GET /progress, POST /me/self-ratings, PATCH /me onboarding, GET /me/entitlements.
 * The XP a session pays is the server's (rule 1) and equals the ledger; a retried event is
 * a replay (rule 6); a paid drill's video reference stays on the server (rule 5).
 */
import {
  completionsResponseSchema,
  drillDetailSchema,
  drillIdParamsSchema,
  drillMediaSchema,
  entitlementsResponseSchema,
  homeResponseSchema,
  meResponseSchema,
  patchMeRequestSchema,
  progressResponseSchema,
  selfRatingsRequestSchema,
  completionsRequestSchema,
  type CompletionEvent,
} from "@eyeq/api-contract";
import { createDb, type PrismaClient } from "@eyeq/db";
import { seedConfig } from "@eyeq/db/seed";
import pg from "pg";
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localAdminUrl, makeAthlete } from "../../../test/db";
import { apiRoute, type Deps } from "../api/pipeline";
import type { Session, SessionVerifier } from "../auth/session";
import { runtimeUrl } from "../db";
import {
  enroll,
  getDrill,
  getDrillMedia,
  getEntitlements,
  getHome,
  getProgress,
  postCompletions,
  postSelfRatings,
} from "./daily";
import { patchMe } from "./me";

const url = localAdminUrl();
const describeDb = url ? describe : describe.skip;

describeDb("daily loop", () => {
  const admin = new pg.Client({ connectionString: url });
  let api: PrismaClient;
  const sessions = new Map<string, Session>();
  let athlete: string;
  let programId: string;
  let sessionId: string;
  const drillIds: string[] = [];
  let ppvDrill: string;
  const tag = crypto.randomUUID().slice(0, 8);

  const verifier: SessionVerifier = {
    verify: async (req) => sessions.get(req.headers.get("x-test-user") ?? "") ?? null,
  };
  const deps = (): Deps => ({ db: api, verifier });
  const req = (
    user: string,
    opts: { method?: string; body?: unknown; key?: string; q?: string } = {},
  ) =>
    new Request(`http://test/api/v1/x${opts.q ?? ""}`, {
      method: opts.method ?? "GET",
      headers: {
        "x-test-user": user,
        "content-type": "application/json",
        ...(opts.key ? { "idempotency-key": opts.key } : {}),
      },
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    });
  const params = (p: Record<string, string>) => ({ params: Promise.resolve(p) });

  const homeRoute = apiRoute({ name: "GET /home", handler: ({ tx }) => getHome(tx) }, deps);
  const enrollRoute = apiRoute(
    {
      name: "POST /programs/:id/enroll",
      params: z.strictObject({ slug: z.uuid() }),
      idempotent: true,
      handler: ({ tx, params: p }) => enroll(tx, p.slug),
    },
    deps,
  );
  const drillRoute = apiRoute(
    {
      name: "GET /drills/:id",
      params: drillIdParamsSchema,
      handler: ({ tx, params: p }) => getDrill(tx, p.id),
    },
    deps,
  );
  const mediaRoute = apiRoute(
    {
      name: "GET /drills/:id/media",
      params: drillIdParamsSchema,
      handler: ({ tx, params: p, req: r }) =>
        getDrillMedia(tx, p.id, new URL(r.url).searchParams.get("session") ?? undefined),
    },
    deps,
  );
  const completionsRoute = apiRoute(
    {
      name: "POST /completions",
      body: completionsRequestSchema,
      rateLimits: ["api_user", "completions"],
      handler: ({ tx, body }) => postCompletions(tx, body.events),
    },
    deps,
  );
  const progressRoute = apiRoute(
    { name: "GET /progress", handler: ({ tx }) => getProgress(tx) },
    deps,
  );
  const ratingsRoute = apiRoute(
    {
      name: "POST /me/self-ratings",
      body: selfRatingsRequestSchema,
      idempotent: true,
      status: 201,
      handler: ({ tx, session, body }) => postSelfRatings(tx, session.userId, body),
    },
    deps,
  );
  const patchMeRoute = apiRoute(
    {
      name: "PATCH /me",
      body: patchMeRequestSchema,
      idempotent: true,
      handler: ({ tx, session, body }) => patchMe(tx, session, body),
    },
    deps,
  );
  const entitlementsRoute = apiRoute(
    { name: "GET /me/entitlements", handler: ({ tx }) => getEntitlements(tx) },
    deps,
  );

  const event = (drillId: string, n: number): CompletionEvent => ({
    clientEventId: `daily-${tag}-${n}`,
    drillId,
    sessionId,
    completedAt: new Date().toISOString(),
    score: null,
    watchPct: 1,
  });

  beforeAll(async () => {
    await admin.connect();
    await seedConfig(admin);
    api = createDb({ connectionString: runtimeUrl("eyeq_api", { DATABASE_URL: url! }), max: 2 });
    athlete = await makeAthlete(admin, { name: "Daily Loop" });
    sessions.set(athlete, { userId: athlete, phone: null, email: null, name: null });

    const p = await admin.query<{ id: string }>(
      `insert into programs (slug, title, duration_days, is_free, in_subscription, status)
       values ($1, $2, 2, true, false, 'published') returning id`,
      [`daily-test-${tag}`, `Daily test ${tag}`],
    );
    programId = p.rows[0]!.id;
    const m = await admin.query<{ id: string }>(
      `insert into modules (program_id, "order", title, unlock_rule) values ($1, 1, 'M', 'immediate') returning id`,
      [programId],
    );
    for (const day of [1, 2]) {
      const s = await admin.query<{ id: string }>(
        `insert into sessions (program_id, module_id, day_number, est_minutes) values ($1, $2, $3, 14) returning id`,
        [programId, m.rows[0]!.id, day],
      );
      if (day === 1) sessionId = s.rows[0]!.id;
      for (let k = 1; k <= 4; k++) {
        const d = await admin.query<{ id: string }>(
          `insert into drills (title, video_provider, video_ref, access, duration_minutes)
           values ($1, 'youtube', $2, 'included', 3) returning id`,
          [`Daily ${tag} ${day}.${k}`, `vid-${tag}-${day}-${k}`],
        );
        await admin.query(
          `insert into session_drills (session_id, drill_id, "order") values ($1, $2, $3)`,
          [s.rows[0]!.id, d.rows[0]!.id, k],
        );
        if (day === 1) drillIds.push(d.rows[0]!.id);
      }
    }
    const ppv = await admin.query<{ id: string }>(
      `insert into drills (title, video_provider, video_ref, access) values ($1, 'youtube', $2, 'ppv') returning id`,
      [`Daily ${tag} paid`, `paid-secret-${tag}`],
    );
    ppvDrill = ppv.rows[0]!.id;
  });

  afterAll(async () => {
    // Activity rows reference the content, so it stays; as drafts it leaves the catalogue.
    await admin.query("update programs set status = 'draft' where id = $1", [programId]);
    await api.$disconnect();
    await admin.end();
  });

  it("onboarding: PATCH /me sets the profile, a minor's date of birth makes them private, onboarded is set once", async () => {
    const minorDob = new Date(Date.now() - 15 * 365.25 * 86400e3).toISOString().slice(0, 10);
    const res = await patchMeRoute(
      req(athlete, {
        method: "PATCH",
        key: `onb-${tag}`,
        body: {
          displayName: "Daily L.",
          sport: "cricket",
          playingLevel: "club",
          dob: minorDob,
          goal: "Reaction speed",
          sessionMinutes: 15,
          onboarded: true,
        },
      }),
    );
    expect(res.status).toBe(200);
    const me = meResponseSchema.parse(await res.json());
    expect(me.isMinor).toBe(true);
    expect(me.visibility).toBe("private");
    expect(me.onboardedAt).not.toBeNull();
    const first = me.onboardedAt;
    const again = meResponseSchema.parse(
      await (
        await patchMeRoute(
          req(athlete, { method: "PATCH", key: `onb2-${tag}`, body: { onboarded: true } }),
        )
      ).json(),
    );
    expect(again.onboardedAt).toBe(first);
    // back to an adult for the rest of the journey
    await admin.query(
      "update profiles set dob = '2000-01-01', visibility = 'public' where id = $1",
      [athlete],
    );
  });

  it("POST /me/self-ratings stores the baseline", async () => {
    const res = await ratingsRoute(
      req(athlete, {
        method: "POST",
        key: `rate-${tag}`,
        body: { kind: "baseline", ratings: { focus: 3, reaction: 2, tracking: 3 } },
      }),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ baseline: { focus: 3, reaction: 2, tracking: 3 } });
  });

  it("enrol, then GET /home shows today's session from the program", async () => {
    const res = await enrollRoute(
      req(athlete, { method: "POST", key: `enrol-${tag}` }),
      params({ slug: programId }),
    );
    expect(res.status).toBe(200);
    const home = homeResponseSchema.parse(await (await homeRoute(req(athlete))).json());
    expect(home.today.kind).toBe("program");
    if (home.today.kind !== "program") return;
    expect(home.today.sessionId).toBe(sessionId);
    expect(home.today.drills.map((d) => d.drillId)).toEqual(drillIds);
    expect(home.today.xpPreview.total).toBe(65);
    expect(home.streak.current).toBe(0);
    expect(JSON.stringify(home)).not.toContain(`vid-${tag}`);
  });

  it("GET /drills/:id gives the drill without a reference; media gives it only with access", async () => {
    const d = drillDetailSchema.parse(
      await (await drillRoute(req(athlete), params({ id: drillIds[0]! }))).json(),
    );
    expect(d.locked).toBe(false);
    expect(d.doneToday).toBe(false);
    const media = await mediaRoute(
      req(athlete, { q: `?session=${sessionId}` }),
      params({ id: drillIds[0]! }),
    );
    expect(media.status).toBe(200);
    expect(drillMediaSchema.parse(await media.json()).ref).toBe(`vid-${tag}-1-1`);

    const paidDetail = await drillRoute(req(athlete), params({ id: ppvDrill }));
    const paidText = await paidDetail.text();
    expect(paidText).not.toContain(`paid-secret-${tag}`);
    expect(drillDetailSchema.parse(JSON.parse(paidText)).locked).toBe(true);
    const paidMedia = await mediaRoute(req(athlete), params({ id: ppvDrill }));
    expect(paidMedia.status).toBe(403);
    const body = await paidMedia.text();
    expect(body).not.toContain(`paid-secret-${tag}`);
    expect(JSON.parse(body)).toMatchObject({ code: "locked", details: { reason: "drill_locked" } });
  });

  it("POST /completions: four drills pay 40 + 25 = 65, equal to the ledger; a locked drill in the batch is refused alone", async () => {
    const events = [
      ...drillIds.map((id, i) => event(id, i + 1)),
      { ...event(ppvDrill, 9), sessionId: null },
    ];
    const res = await completionsRoute(req(athlete, { method: "POST", body: { events } }));
    expect(res.status).toBe(200);
    const { results } = completionsResponseSchema.parse(await res.json());
    expect(results.map((r) => r.ok)).toEqual([true, true, true, true, false]);
    const refused = results[4]!;
    expect(!refused.ok && refused.error.code).toBe("locked");

    const oks = results.flatMap((r) => (r.ok ? [r.result] : []));
    expect(oks.reduce((a, r) => a + r.xpEarned, 0)).toBe(65);
    const last = oks[3]!;
    expect(last.session).toMatchObject({
      kind: "program",
      complete: true,
      drillsDone: 4,
      drillsTotal: 4,
    });
    expect(last.xp.map((x) => [x.reason, x.amount])).toEqual([
      ["drill", 10],
      ["session_bonus", 25],
    ]);
    expect(last.streak).toMatchObject({ before: 0, after: 1, extended: true });

    const ledger = await admin.query<{ s: string }>(
      "select coalesce(sum(amount), 0)::text as s from xp_ledger where user_id = $1",
      [athlete],
    );
    expect(Number(ledger.rows[0]!.s)).toBe(65);
  });

  it("a retried event returns the stored result and writes nothing", async () => {
    const res = await completionsRoute(
      req(athlete, { method: "POST", body: { events: [event(drillIds[3]!, 4)] } }),
    );
    const { results } = completionsResponseSchema.parse(await res.json());
    expect(results[0]!.ok && results[0]!.result.duplicate).toBe(true);
    const rows = await admin.query<{ n: string }>(
      "select count(*)::text as n from drill_completions where user_id = $1",
      [athlete],
    );
    expect(rows.rows[0]!.n).toBe("4");
  });

  it("GET /home after the session: done, streak 1; GET /progress counts it", async () => {
    const home = homeResponseSchema.parse(await (await homeRoute(req(athlete))).json());
    expect(home.today.completed).toBe(true);
    expect(home.streak).toMatchObject({ current: 1, state: "done" });
    expect(home.level.totalXp).toBe(65);
    const prog = progressResponseSchema.parse(await (await progressRoute(req(athlete))).json());
    expect(prog.sessionsTotal).toBe(1);
    expect(prog.ratings.baseline).toEqual({ focus: 3, reaction: 2, tracking: 3 });
    // Dates on Progress are shown in the profile's zone, which the payload carries.
    const tz = await admin.query<{ timezone: string }>(
      "select timezone from profiles where id = $1",
      [athlete],
    );
    expect(prog.timezone).toBe(tz.rows[0]!.timezone);
  });

  it("GET /me/entitlements is empty for a free athlete", async () => {
    const res = await entitlementsRoute(req(athlete));
    expect(entitlementsResponseSchema.parse(await res.json()).entitlements).toEqual([]);
  });
});
