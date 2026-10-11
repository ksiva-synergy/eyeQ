/**
 * Compete and rewards against a real database, as eyeq_api, through the /api/v1 pipeline
 * (plan phase 6, section 7): GET /leaderboards, /challenges, /badges, /rewards and
 * POST /rewards/purchase. Board rows carry only what rule 11 allows; private athletes and
 * minors are absent from the rows and still see their own rank (plan 6.6, D11).
 * The athletes play a sport of their own, so the sport board holds only them.
 */
import {
  badgesResponseSchema,
  challengesResponseSchema,
  leaderboardQuerySchema,
  leaderboardResponseSchema,
  rewardPurchaseRequestSchema,
  rewardPurchaseResponseSchema,
  rewardsResponseSchema,
  type LeaderboardResponse,
} from "@eyeq/api-contract";
import { createDb, type PrismaClient } from "@eyeq/db";
import { seedConfig } from "@eyeq/db/seed";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localAdminUrl, makeAthlete } from "../../../test/db";
import { ApiError } from "../api/errors";
import { apiRoute, type Deps } from "../api/pipeline";
import type { Session, SessionVerifier } from "../auth/session";
import { runtimeUrl } from "../db";
import { getBadges, getChallenges, getLeaderboard, getRewards, purchaseReward } from "./compete";

const url = localAdminUrl();
const describeDb = url ? describe : describe.skip;

describeDb("compete and rewards", () => {
  const admin = new pg.Client({ connectionString: url });
  let api: PrismaClient;
  const sessions = new Map<string, Session>();
  const tag = crypto.randomUUID().slice(0, 8);
  const sport = `sport-${tag}`;
  const minorDob = new Date(Date.now() - 15 * 365.25 * 86400e3).toISOString().slice(0, 10);
  const ids: Record<"top" | "me" | "priv" | "minor" | "shown", string> = {
    top: "",
    me: "",
    priv: "",
    minor: "",
    shown: "",
  };

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

  const boardRoute = apiRoute(
    {
      name: "GET /leaderboards",
      handler: ({ tx, req: r }) => {
        const q = leaderboardQuerySchema.safeParse(Object.fromEntries(new URL(r.url).searchParams));
        if (!q.success) throw new ApiError(400, "validation_failed", "The request is not valid.");
        return getLeaderboard(tx, q.data);
      },
    },
    deps,
  );
  const challengesRoute = apiRoute(
    { name: "GET /challenges", handler: ({ tx }) => getChallenges(tx) },
    deps,
  );
  const badgesRoute = apiRoute({ name: "GET /badges", handler: ({ tx }) => getBadges(tx) }, deps);
  const rewardsRoute = apiRoute(
    { name: "GET /rewards", handler: ({ tx }) => getRewards(tx) },
    deps,
  );
  const purchaseRoute = apiRoute(
    {
      name: "POST /rewards/purchase",
      body: rewardPurchaseRequestSchema,
      idempotent: true,
      handler: ({ tx, body }) => purchaseReward(tx, body),
    },
    deps,
  );

  const board = async (
    user: string,
    q: string,
  ): Promise<{ raw: string; b: LeaderboardResponse }> => {
    const res = await boardRoute(req(user, { q }));
    expect(res.status).toBe(200);
    const raw = await res.text();
    return { raw, b: leaderboardResponseSchema.parse(JSON.parse(raw)) };
  };

  beforeAll(async () => {
    await admin.connect();
    await seedConfig(admin);
    api = createDb({ connectionString: runtimeUrl("eyeq_api", { DATABASE_URL: url! }), max: 2 });
    const people: [keyof typeof ids, string, number, string | null, string][] = [
      ["top", "Top Athlete", 300, null, "public"],
      ["me", "Mid Athlete", 200, null, "public"],
      ["priv", "Private Athlete", 250, null, "private"],
      ["minor", "Young Athlete", 400, minorDob, "public"],
      ["shown", "Young Shown", 100, minorDob, "public"],
    ];
    for (const [key, name, xp, dob, vis] of people) {
      const id = await makeAthlete(admin, { name });
      ids[key] = id;
      sessions.set(id, { userId: id, phone: null, email: null, name: null });
      await admin.query("update profiles set sport = $2, visibility = $3, dob = $4 where id = $1", [
        id,
        sport,
        vis,
        dob,
      ]);
      await admin.query(
        `insert into xp_ledger (user_id, amount, requested_amount, reason, local_date, created_at)
         values ($1, $2, $2, 'admin', current_date, now() - interval '1 minute')`,
        [id, xp],
      );
      await admin.query("select rebuild_user_stats($1)", [id]);
    }
    // Reward items of this run's own (CI seeds after the integration tests, and the seed
    // refuses to run twice); deactivated afterwards.
    await admin.query(
      `insert into reward_items (slug, kind, title, coin_price, sort) values
         ($1, 'freeze', 'Streak freeze', 50, -2), ($2, 'drill_unlock', 'Unlock a single drill', 30, -1)`,
      [`freeze-${tag}`, `unlock-${tag}`],
    );
    // A minor's date sets the profile private (D11); "Young Shown" then chooses to show.
    await admin.query("update profiles set visibility = 'public' where id = $1", [ids.shown]);
    await admin.query("select leaderboard_refresh()");
  });

  afterAll(async () => {
    await admin.query("update reward_items set active = false where slug in ($1, $2)", [
      `freeze-${tag}`,
      `unlock-${tag}`,
    ]);
    await api.$disconnect();
    await admin.end();
  });

  it("GET /leaderboards: a public row holds display name, initials, level, XP and rank only (rule 11)", async () => {
    const { raw, b } = await board(ids.me, "?scope=sport");
    expect(b.scopeValue).toBe(sport);
    for (const r of b.rows)
      expect(Object.keys(r).sort()).toEqual(
        ["delta", "displayName", "initials", "isMe", "level", "rank", "xp"].sort(),
      );
    // No user id, no date of birth, no phone, anywhere in the payload.
    for (const id of Object.values(ids)) expect(raw).not.toContain(id);
    expect(raw).not.toContain(minorDob);
    expect(b.rows.find((r) => r.displayName === "Top Athlete")).toMatchObject({
      rank: 1,
      initials: "TA",
      xp: 300,
    });
  });

  it("GET /leaderboards: private athletes and minors are absent from the rows, in either filter", async () => {
    for (const q of ["?scope=sport", "?scope=sport&period=all"]) {
      const { b } = await board(ids.me, q);
      const names = b.rows.map((r) => r.displayName);
      expect(names).toEqual(["Top Athlete", "Mid Athlete", "Young Shown"]);
      expect(names).not.toContain("Private Athlete");
      expect(names).not.toContain("Young Athlete");
      expect(b.count).toBe(3);
    }
  });

  it("GET /leaderboards: the athlete's own row is pinned with the gap to the row above", async () => {
    const { b } = await board(ids.me, "?scope=sport");
    expect(b.me).toMatchObject({
      rank: 2,
      xp: 200,
      isPublic: true,
      displayName: "Mid Athlete",
      sport,
      gapAbove: { xp: 100, rank: 1 },
    });
    expect(b.rows.find((r) => r.isMe)?.displayName).toBe("Mid Athlete");
  });

  it("GET /leaderboards: a private athlete and a hidden minor each still see their own rank", async () => {
    const priv = (await board(ids.priv, "?scope=sport")).b;
    expect(priv.rows.some((r) => r.isMe)).toBe(false);
    expect(priv.me).toMatchObject({
      rank: 2,
      xp: 250,
      isPublic: false,
      displayName: "Private Athlete",
    });
    const minor = (await board(ids.minor, "?scope=sport")).b;
    expect(minor.rows.some((r) => r.isMe)).toBe(false);
    expect(minor.me).toMatchObject({ rank: 1, xp: 400, isPublic: false });
  });

  it("GET /leaderboards: the global board follows the same rule", async () => {
    const { raw, b } = await board(ids.me, "");
    expect(b.scope).toBe("global");
    expect(b.scopeValue).toBe("");
    for (const r of b.rows) expect(Object.keys(r)).not.toContain("sport");
    expect(raw).not.toContain("Private Athlete");
    expect(raw).not.toContain("Young Athlete");
    expect(b.me?.rank).toBeGreaterThan(0);
  });

  it("GET /leaderboards refuses an unknown period", async () => {
    expect((await boardRoute(req(ids.me, { q: "?period=month" }))).status).toBe(400);
  });

  it("GET /challenges and GET /badges answer in the contract's shape", async () => {
    const c = await challengesRoute(req(ids.me));
    expect(c.status).toBe(200);
    challengesResponseSchema.parse(await c.json());
    const res = await badgesRoute(req(ids.me));
    expect(res.status).toBe(200);
    const b = badgesResponseSchema.parse(await res.json());
    expect(b.titles[0]).toEqual({ title: "Rookie", fromLevel: 1, toLevel: 4 });
    expect(b.titles.at(-1)).toMatchObject({ title: "Peak", toLevel: null });
    expect(b.level).toBeGreaterThanOrEqual(1);
  });

  it("POST /rewards/purchase: a freeze costs its price, the balance falls, and a short balance is a 409", async () => {
    const before = rewardsResponseSchema.parse(await (await rewardsRoute(req(ids.me))).json());
    const freeze = before.items.find((i) => i.slug === `freeze-${tag}`);
    expect(freeze).toBeDefined();
    const buy = (key: string) =>
      purchaseRoute(req(ids.me, { method: "POST", key, body: { itemId: freeze!.id } }));

    const poor = await buy(`poor-${tag}`);
    expect(poor.status).toBe(409);
    expect(await poor.json()).toMatchObject({
      code: "conflict",
      details: { reason: "insufficient_coins" },
    });

    await admin.query("select earn_coins($1, 120, 'admin')", [ids.me]);
    const res = await buy(`frz-${tag}`);
    expect(res.status).toBe(200);
    const bought = rewardPurchaseResponseSchema.parse(await res.json());
    expect(bought).toMatchObject({
      kind: "freeze",
      coinsSpent: freeze!.coinPrice,
      freezesHeld: before.freezesHeld + 1,
    });
    expect(bought.coinsBalance).toBe(before.coins + 120 - freeze!.coinPrice);

    // A retried request is a replay: nothing is spent twice (rule 6).
    const again = rewardPurchaseResponseSchema.parse(await (await buy(`frz-${tag}`)).json());
    expect(again.coinsBalance).toBe(bought.coinsBalance);
    const ledger = await admin.query(
      "select count(*)::int as n from coin_ledger where user_id = $1 and reason = 'spend_freeze'",
      [ids.me],
    );
    expect(ledger.rows[0]!.n).toBe(1);
  });

  it("GET /rewards offers locked drills without a video reference, and a coin unlock opens one", async () => {
    const p = await admin.query<{ id: string }>(
      `insert into programs (slug, title, duration_days, is_free, in_subscription, status)
       values ($1, $2, 1, false, false, 'published') returning id`,
      [`compete-test-${tag}`, `Compete test ${tag}`],
    );
    const m = await admin.query<{ id: string }>(
      `insert into modules (program_id, "order", title, unlock_rule) values ($1, 1, 'M', 'immediate') returning id`,
      [p.rows[0]!.id],
    );
    const s = await admin.query<{ id: string }>(
      `insert into sessions (program_id, module_id, day_number, est_minutes) values ($1, $2, 1, 10) returning id`,
      [p.rows[0]!.id, m.rows[0]!.id],
    );
    const d = await admin.query<{ id: string }>(
      `insert into drills (title, video_provider, video_ref, access, duration_minutes, status)
       values ($1, 'youtube', $2, 'included', 3, 'published') returning id`,
      [`Locked ${tag}`, `secret-ref-${tag}`],
    );
    await admin.query(
      `insert into session_drills (session_id, drill_id, "order") values ($1, $2, 1)`,
      [s.rows[0]!.id, d.rows[0]!.id],
    );
    try {
      const res = await rewardsRoute(req(ids.top));
      const raw = await res.text();
      expect(raw).not.toContain(`secret-ref-${tag}`);
      const r = rewardsResponseSchema.parse(JSON.parse(raw));
      const offer = r.unlockableDrills.find((x) => x.id === d.rows[0]!.id);
      expect(offer).toMatchObject({ title: `Locked ${tag}`, programTitle: `Compete test ${tag}` });

      await admin.query("select earn_coins($1, $2, 'admin')", [ids.top, offer!.coinPrice]);
      const unlock = r.items.find((i) => i.slug === `unlock-${tag}`)!;
      const bought = await purchaseRoute(
        req(ids.top, {
          method: "POST",
          key: `unl-${tag}`,
          body: { itemId: unlock.id, drillId: offer!.id },
        }),
      );
      expect(bought.status).toBe(200);
      expect(rewardPurchaseResponseSchema.parse(await bought.json()).entitlementId).not.toBeNull();
      const after = rewardsResponseSchema.parse(await (await rewardsRoute(req(ids.top))).json());
      expect(after.unlockableDrills.some((x) => x.id === offer!.id)).toBe(false);
    } finally {
      await admin.query("update programs set status = 'draft' where id = $1", [p.rows[0]!.id]);
    }
  });
});
