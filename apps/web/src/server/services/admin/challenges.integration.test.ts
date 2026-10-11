/**
 * The challenge editor through /api/admin against a real database, as eyeq_service
 * (plan phase 6): weekly challenges for this week or next (one per week; next week's can
 * be removed so the live one repeats), program challenges on a program, IST windows, the
 * goal checked against the program, closed challenges frozen, every change audited, and
 * coaches only.
 */
import {
  adminChallengeSchema,
  adminChallengeUpdateSchema,
  adminIdParamsSchema,
  adminProgramChallengeCreateSchema,
  adminProgramChallengesResponseSchema,
  adminWeeklyCreateSchema,
  adminWeeklyResponseSchema,
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
  createProgramChallenge,
  createWeekly,
  deleteChallenge,
  programChallenges,
  updateChallenge,
  weeklyChallenges,
} from "./challenges";

const url = localAdminUrl();
const describeDb = url ? describe : describe.skip;

describeDb("/api/admin challenges", () => {
  const admin = new pg.Client({ connectionString: url });
  let service: PrismaClient;
  const sessions = new Map<string, Session>();
  const tag = crypto.randomUUID().slice(0, 8);
  let coach: string;
  let athlete: string;
  let programId: string;
  let moduleId: string;
  let drillId: string;
  let otherDrill: string;
  const made: string[] = [];

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
  let n = 0;
  const key = () => `ch-${tag}-${++n}`;

  const weekly = adminRoute(
    { name: "GET /admin/challenges", handler: ({ tx }) => weeklyChallenges(tx) },
    deps,
  );
  const createW = adminRoute(
    {
      name: "POST /admin/challenges",
      body: adminWeeklyCreateSchema,
      mutation: true,
      status: 201,
      handler: ({ tx, body, audit }) => createWeekly(tx, body, audit),
    },
    deps,
  );
  const patch = adminRoute(
    {
      name: "PATCH /admin/challenges/:id",
      params: adminIdParamsSchema,
      body: adminChallengeUpdateSchema,
      mutation: true,
      handler: ({ tx, params: p, body, audit }) => updateChallenge(tx, p.id, body, audit),
    },
    deps,
  );
  const del = adminRoute(
    {
      name: "DELETE /admin/challenges/:id",
      params: adminIdParamsSchema,
      mutation: true,
      handler: ({ tx, params: p, audit }) => deleteChallenge(tx, p.id, audit),
    },
    deps,
  );
  const listP = adminRoute(
    {
      name: "GET /admin/programs/:id/challenges",
      params: adminIdParamsSchema,
      handler: ({ tx, params: p }) => programChallenges(tx, p.id),
    },
    deps,
  );
  const createP = adminRoute(
    {
      name: "POST /admin/programs/:id/challenges",
      params: adminIdParamsSchema,
      body: adminProgramChallengeCreateSchema,
      mutation: true,
      status: 201,
      handler: ({ tx, params: p, body, audit }) => createProgramChallenge(tx, p.id, body, audit),
    },
    deps,
  );

  const program = async (title: string) => {
    const p = await admin.query<{ id: string }>(
      `insert into programs (slug, title, duration_days, is_free, in_subscription, status)
       values ($1, $2, 7, true, false, 'draft') returning id`,
      [`${title.toLowerCase().replace(/\W+/g, "-")}-${tag}`, `${title} ${tag}`],
    );
    const m = await admin.query<{ id: string }>(
      `insert into modules (program_id, "order", title, unlock_rule) values ($1, 1, 'M1', 'immediate') returning id`,
      [p.rows[0]!.id],
    );
    const s = await admin.query<{ id: string }>(
      `insert into sessions (program_id, module_id, day_number, est_minutes) values ($1, $2, 1, 10) returning id`,
      [p.rows[0]!.id, m.rows[0]!.id],
    );
    const d = await admin.query<{ id: string }>(
      `insert into drills (title, video_provider, video_ref, access) values ($1, 'youtube', 'x', 'included') returning id`,
      [`Drill ${title} ${tag}`],
    );
    await admin.query(
      `insert into session_drills (session_id, drill_id, "order") values ($1, $2, 1)`,
      [s.rows[0]!.id, d.rows[0]!.id],
    );
    return { programId: p.rows[0]!.id, moduleId: m.rows[0]!.id, drillId: d.rows[0]!.id };
  };

  const audits = async (id: string) =>
    (
      await admin.query<{ action: string; actor_id: string }>(
        "select action, actor_id from audit_log where target_id = $1 order by created_at, id",
        [id],
      )
    ).rows;

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
    ({ programId, moduleId, drillId } = await program("Challenge Test"));
    otherDrill = (await program("Other")).drillId;
  });

  afterAll(async () => {
    // Weekly challenges are global: leave none of this run's behind.
    if (made.length) await admin.query("delete from challenges where id = any($1::uuid[])", [made]);
    await service.$disconnect();
    await admin.end();
  });

  it("only a coach or owner reaches the editor", async () => {
    expect((await weekly(req(athlete))).status).toBe(403);
    expect((await weekly(req(coach))).status).toBe(200);
  });

  it("weekly: next week's challenge is scheduled for Monday 00:00 IST, once; it can be edited, then removed so the live one repeats", async () => {
    const before = adminWeeklyResponseSchema.parse(await (await weekly(req(coach))).json());
    // Clear a next week that an earlier local run or the seed left (it has not started).
    if (before.next) await admin.query("delete from challenges where id = $1", [before.next.id]);
    const body = {
      week: "next",
      title: `Six a week ${tag}`,
      target: 6,
      rewardXp: 150,
      rewardCoins: 40,
      badgeId: null,
    };
    const res = await createW(req(coach, { method: "POST", body, key: key() }));
    expect(res.status).toBe(201);
    const c = adminChallengeSchema.parse(await res.json());
    made.push(c.id);
    expect(c).toMatchObject({
      type: "weekly",
      state: "scheduled",
      goal: { metric: "sessions_total", gte: 6 },
    });
    // Monday 00:00 IST is Sunday 18:30 UTC.
    expect(c.windowStart).toBe(`${prevDay(before.nextWeekStart)}T18:30:00.000Z`);
    expect(Date.parse(c.windowEnd) - Date.parse(c.windowStart)).toBe(7 * 86400e3);

    const again = await createW(req(coach, { method: "POST", body, key: key() }));
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ details: { reason: "week_taken" } });

    const edited = await patch(
      req(coach, {
        method: "PATCH",
        body: { goal: { metric: "sessions_total", gte: 5 }, rewardXp: 120 },
        key: key(),
      }),
      params({ id: c.id }),
    );
    expect(adminChallengeSchema.parse(await edited.json())).toMatchObject({
      rewardXp: 120,
      goal: { gte: 5 },
    });
    const wrongGoal = await patch(
      req(coach, {
        method: "PATCH",
        body: { goal: { metric: "module_sessions", moduleId } },
        key: key(),
      }),
      params({ id: c.id }),
    );
    expect(wrongGoal.status).toBe(400);

    const listed = adminWeeklyResponseSchema.parse(await (await weekly(req(coach))).json());
    expect(listed.next?.id).toBe(c.id);
    expect(
      (await del(req(coach, { method: "DELETE", key: key() }), params({ id: c.id }))).status,
    ).toBe(200);
    const after = adminWeeklyResponseSchema.parse(await (await weekly(req(coach))).json());
    expect(after.next).toBeNull();
    expect((await audits(c.id)).map((a) => a.action)).toEqual([
      "challenge.create",
      "challenge.update",
      "challenge.delete",
    ]);
    expect((await audits(c.id)).every((a) => a.actor_id === coach)).toBe(true);
  });

  it("weekly: a second challenge for this week is refused; a live one cannot be removed", async () => {
    const state = adminWeeklyResponseSchema.parse(await (await weekly(req(coach))).json());
    let liveId = state.live?.id;
    if (!liveId) {
      const res = await createW(
        req(coach, {
          method: "POST",
          body: {
            week: "current",
            title: `Now ${tag}`,
            target: 3,
            rewardXp: 100,
            rewardCoins: 0,
            badgeId: null,
          },
          key: key(),
        }),
      );
      expect(res.status).toBe(201);
      liveId = adminChallengeSchema.parse(await res.json()).id;
      made.push(liveId);
    }
    const second = await createW(
      req(coach, {
        method: "POST",
        body: {
          week: "current",
          title: `Also now ${tag}`,
          target: 3,
          rewardXp: 100,
          rewardCoins: 0,
          badgeId: null,
        },
        key: key(),
      }),
    );
    expect(second.status).toBe(409);
    const removeLive = await del(
      req(coach, { method: "DELETE", key: key() }),
      params({ id: liveId }),
    );
    expect(removeLive.status).toBe(409);
  });

  it("program challenges: windows in IST, the goal must belong to the program, closed ones are frozen", async () => {
    const ok = await createP(
      req(coach, {
        method: "POST",
        body: {
          title: "Finish Module 1 by Sunday",
          goal: { metric: "module_sessions", moduleId },
          startDate: "2030-03-04",
          endDate: "2030-03-10",
          rewardXp: 60,
          rewardCoins: 0,
          badgeId: null,
        },
        key: key(),
      }),
      params({ id: programId }),
    );
    expect(ok.status).toBe(201);
    const c = adminChallengeSchema.parse(await ok.json());
    expect(c).toMatchObject({
      type: "program",
      programId,
      state: "scheduled",
      windowStart: "2030-03-03T18:30:00.000Z",
      windowEnd: "2030-03-10T18:30:00.000Z",
    });

    const foreign = await createP(
      req(coach, {
        method: "POST",
        body: {
          title: "Score elsewhere",
          goal: { metric: "score_gte", drillId: otherDrill, gte: 25 },
          startDate: "2030-03-04",
          endDate: "2030-03-10",
          rewardXp: 40,
          rewardCoins: 0,
          badgeId: null,
        },
        key: key(),
      }),
      params({ id: programId }),
    );
    expect(foreign.status).toBe(400);
    const backwards = await createP(
      req(coach, {
        method: "POST",
        body: {
          title: "Backwards",
          goal: { metric: "score_gte", drillId, gte: 25 },
          startDate: "2030-03-10",
          endDate: "2030-03-04",
          rewardXp: 40,
          rewardCoins: 0,
          badgeId: null,
        },
        key: key(),
      }),
      params({ id: programId }),
    );
    expect(backwards.status).toBe(400);

    const past = adminChallengeSchema.parse(
      await (
        await createP(
          req(coach, {
            method: "POST",
            body: {
              title: "Last spring",
              goal: { metric: "score_gte", drillId, gte: 25 },
              startDate: "2025-03-03",
              endDate: "2025-03-09",
              rewardXp: 40,
              rewardCoins: 0,
              badgeId: null,
            },
            key: key(),
          }),
          params({ id: programId }),
        )
      ).json(),
    );
    expect(past.state).toBe("ended");
    const frozen = await patch(
      req(coach, { method: "PATCH", body: { rewardXp: 500 }, key: key() }),
      params({ id: past.id }),
    );
    expect(frozen.status).toBe(409);

    const moved = await patch(
      req(coach, { method: "PATCH", body: { endDate: "2030-03-12" }, key: key() }),
      params({ id: c.id }),
    );
    expect(adminChallengeSchema.parse(await moved.json()).windowEnd).toBe(
      "2030-03-12T18:30:00.000Z",
    );

    const list = adminProgramChallengesResponseSchema.parse(
      await (await listP(req(coach), params({ id: programId }))).json(),
    );
    expect(list.challenges.map((x) => x.title).sort()).toEqual([
      "Finish Module 1 by Sunday",
      "Last spring",
    ]);
  });
});

/** "2026-10-12" → "2026-10-11": Monday 00:00 IST falls on the Sunday in UTC. */
function prevDay(isoDate: string): string {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) - 86400e3).toISOString().slice(0, 10);
}
