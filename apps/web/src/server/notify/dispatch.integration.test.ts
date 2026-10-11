/**
 * The notification dispatcher against a real database (plan phase 6): the cron route
 * refuses a call without the secret; two overlapping runs send each notification once;
 * outcomes are recorded (sent, retry with backoff, skipped with a reason); a gone web push
 * subscription is disabled; web push is really encrypted and VAPID-signed; the in-app
 * feed and push subscriptions through /api/v1.
 */
import { createECDH, randomBytes } from "node:crypto";
import {
  feedReadRequestSchema,
  feedResponseSchema,
  pushTokenDeleteSchema,
  pushTokenRequestSchema,
} from "@eyeq/api-contract";
import { createDb, type PrismaClient } from "@eyeq/db";
import { seedConfig } from "@eyeq/db/seed";
import pg from "pg";
import webpush from "web-push";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localAdminUrl, makeAthlete } from "../../../test/db";
import { apiRoute, type Deps } from "../api/pipeline";
import type { Session, SessionVerifier } from "../auth/session";
import { runtimeUrl } from "../db";
import { deletePushToken, getFeed, markRead, savePushToken } from "../services/notify";
import type { Channel, Claimed, SendResult } from "./channels";
import { handleCron } from "./cron";
import { dispatch, type DispatchResult } from "./dispatch";
import { resendChannel } from "./email";
import { pushOptions, webPushChannel } from "./web-push";

const url = localAdminUrl();
const describeDb = url ? describe : describe.skip;

const empty: DispatchResult = {
  batches: 0,
  claimed: 0,
  sent: 0,
  skipped: 0,
  retried: 0,
  failed: 0,
  lost: 0,
};

describe("GET /api/cron/dispatch refuses any call without the cron secret", () => {
  const call = (auth: string | null, secret: string | undefined) => {
    let ran = false;
    const req = new Request("http://test/api/cron/dispatch", {
      headers: auth === null ? {} : { authorization: auth },
    });
    return handleCron(req, {
      secret,
      run: async () => {
        ran = true;
        return empty;
      },
    }).then((res) => ({ status: res.status, ran }));
  };

  it("no header, a wrong secret, or a secret with the wrong scheme: 401, nothing runs", async () => {
    for (const auth of [null, "Bearer wrong", "Bearer s3cret-but-longer", "s3cret", "Basic s3cret"])
      expect(await call(auth, "s3cret")).toEqual({ status: 401, ran: false });
  });

  it("with no secret configured at all, every call is refused", async () => {
    expect(await call("Bearer ", undefined)).toEqual({ status: 401, ran: false });
    expect(await call("Bearer undefined", undefined)).toEqual({ status: 401, ran: false });
  });

  it("the right secret runs the dispatcher", async () => {
    expect(await call("Bearer s3cret", "s3cret")).toEqual({ status: 200, ran: true });
  });

  it("a run that throws answers 500 (visible in Vercel's logs)", async () => {
    const req = new Request("http://test/api/cron/dispatch", {
      headers: { authorization: "Bearer s3cret" },
    });
    const res = await handleCron(req, {
      secret: "s3cret",
      run: () => Promise.reject(new Error("database down")),
    });
    expect(res.status).toBe(500);
  });
});

/** A web push subscription a real browser could have made: a P-256 key and an auth secret. */
function fakeSubscription(endpoint: string) {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    endpoint,
    keys: {
      p256dh: ecdh.getPublicKey().toString("base64url"),
      auth: randomBytes(16).toString("base64url"),
    },
  };
}

describeDb("the dispatcher", () => {
  const admin = new pg.Client({ connectionString: url });
  let service: PrismaClient;
  let api: PrismaClient;
  const tag = crypto.randomUUID().slice(0, 8);
  let athlete: string;
  const sessions = new Map<string, Session>();

  const queue = async (user: string, kind: string, key: string, extra: string = "") => {
    const r = await admin.query<{ id: string }>(
      `insert into notifications (user_id, kind, dedupe_key, local_date ${extra ? ", channel, data" : ""})
       values ($1, $2, $3, current_date ${extra ? ", 'email', $4::jsonb" : ""}) returning id`,
      extra ? [user, kind, `${key}-${tag}`, extra] : [user, kind, `${key}-${tag}`],
    );
    return r.rows[0]!.id;
  };
  const status = async (id: string) =>
    (
      await admin.query<{
        status: string;
        last_error: string | null;
        attempts: number;
        later: boolean;
      }>(
        "select status, last_error, attempts, send_after > now() as later from notifications where id = $1",
        [id],
      )
    ).rows[0]!;

  beforeAll(async () => {
    await admin.connect();
    await seedConfig(admin);
    service = createDb({
      connectionString: runtimeUrl("eyeq_service", { DATABASE_URL: url! }),
      max: 4,
    });
    api = createDb({ connectionString: runtimeUrl("eyeq_api", { DATABASE_URL: url! }), max: 2 });
    athlete = await makeAthlete(admin, { name: "Dispatch Athlete" });
    sessions.set(athlete, { userId: athlete, phone: null, email: null, name: null });
  });

  afterAll(async () => {
    await service.$disconnect();
    await api.$disconnect();
    await admin.end();
  });

  it("two runs started together send each notification once", async () => {
    const users = await Promise.all(
      Array.from({ length: 6 }, (_, i) => makeAthlete(admin, { name: `Race ${i}` })),
    );
    const mine = new Set<string>();
    for (const [i, u] of users.entries()) {
      await admin.query(
        "insert into push_tokens (user_id, token, platform) values ($1, $2, 'web')",
        [u, JSON.stringify(fakeSubscription(`https://push.example/${tag}/${i}`))],
      );
      mine.add(await queue(u, "daily_reminder", `race-${i}-a`));
      mine.add(await queue(u, "streak_at_risk", `race-${i}-b`));
    }
    const sends: string[] = [];
    const slow: Channel = {
      async send(n: Claimed): Promise<SendResult> {
        sends.push(n.id);
        await new Promise((r) => setTimeout(r, 20));
        return { outcome: "sent" };
      },
    };
    const channels = { push: slow, email: slow };
    await Promise.all([
      dispatch({ db: service, channels, batch: 3 }),
      dispatch({ db: service, channels, batch: 3 }),
    ]);
    const mineSent = sends.filter((id) => mine.has(id));
    expect(mineSent.sort()).toEqual([...mine].sort());
    expect(new Set(sends).size).toBe(sends.length);
    for (const id of mine) expect((await status(id)).status).toBe("sent");
  });

  it("records each outcome: a gone subscription is disabled, a 503 is retried later, a kind switched off is skipped", async () => {
    const u = await makeAthlete(admin, { name: "Outcomes" });
    const t = await admin.query<{ id: string }>(
      "insert into push_tokens (user_id, token, platform) values ($1, $2, 'web') returning id",
      [u, JSON.stringify(fakeSubscription(`https://push.example/${tag}/gone`))],
    );
    const gone = await queue(u, "daily_reminder", "gone");
    // Answers by endpoint, not by call order: other queued rows may be claimed in the same run.
    const channels = {
      push: webPushChannel(async (sub) => {
        const code = sub.endpoint.endsWith("/gone")
          ? 410
          : sub.endpoint.endsWith("/busy")
            ? 503
            : 0;
        if (code) throw Object.assign(new Error(`push ${code}`), { statusCode: code });
        return { statusCode: 201 };
      }),
      email: resendChannel(undefined),
    };
    await dispatch({ db: service, channels });
    expect(await status(gone)).toMatchObject({ status: "skipped", last_error: "no_device" });
    const tok = await admin.query("select disabled_at from push_tokens where id = $1", [
      t.rows[0]!.id,
    ]);
    expect(tok.rows[0].disabled_at).not.toBeNull();

    const u2 = await makeAthlete(admin, { name: "Retry" });
    await admin.query("insert into push_tokens (user_id, token, platform) values ($1, $2, 'web')", [
      u2,
      JSON.stringify(fakeSubscription(`https://push.example/${tag}/busy`)),
    ]);
    const busy = await queue(u2, "daily_reminder", "busy");
    await dispatch({ db: service, channels });
    expect(await status(busy)).toMatchObject({
      status: "queued",
      last_error: "http_503",
      attempts: 1,
      later: true,
    });

    await admin.query("update profiles set notify_challenge = false where id = $1", [u2]);
    const off = await queue(u2, "challenge_ending", "off");
    await dispatch({ db: service, channels });
    expect(await status(off)).toMatchObject({ status: "skipped", last_error: "toggle_off" });

    // A web-only athlete with no subscription: skipped for push, still in the feed.
    const bare = await queue(athlete, "streak_at_risk", "bare");
    await dispatch({ db: service, channels });
    expect(await status(bare)).toMatchObject({ status: "skipped", last_error: "no_device" });
  });

  it("email through Resend: the row id is the idempotency key; no address is skipped", async () => {
    const u = await makeAthlete(admin, { name: "Email" });
    const withAddress = await queue(
      u,
      "receipt",
      "mail",
      JSON.stringify({ email: "a@example.com" }),
    );
    const noAddress = await queue(u, "receipt", "nomail", "{}");
    const calls: { url: string; init: RequestInit }[] = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ id: "re_1" }), { status: 200 });
    }) as unknown as typeof fetch;
    await dispatch({
      db: service,
      channels: {
        push: webPushChannel(undefined),
        email: resendChannel({ key: "re_test", from: "EyeQ <no-reply@example.com>" }, fakeFetch),
      },
    });
    expect(await status(withAddress)).toMatchObject({ status: "sent" });
    expect(await status(noAddress)).toMatchObject({ status: "skipped", last_error: "no_address" });
    const call = calls.find(
      (c) =>
        (c.init.headers as Record<string, string>)["idempotency-key"] ===
        `notification-${withAddress}`,
    );
    expect(call?.url).toBe("https://api.resend.com/emails");
    expect(JSON.parse(String(call?.init.body))).toMatchObject({
      to: "a@example.com",
      subject: "Your EyeQ receipt",
    });
  });

  it("web push is encrypted and VAPID-signed: the request the push service receives", () => {
    const keys = webpush.generateVAPIDKeys();
    const sub = fakeSubscription(`https://fcm.googleapis.com/fcm/send/${tag}`);
    const payload = JSON.stringify({ title: "Time to train", body: "x", url: "/app" });
    // The exact request vapidSender sends, built without sending it.
    const r = webpush.generateRequestDetails(
      sub,
      payload,
      pushOptions({ ...keys, subject: "mailto:ops@example.com" }),
    );
    expect(r.method).toBe("POST");
    expect(r.endpoint).toBe(sub.endpoint);
    expect(r.headers["Content-Encoding"]).toBe("aes128gcm");
    expect(String(r.headers["Authorization"])).toMatch(/^vapid t=.+, k=.+$/);
    expect(String(r.headers["Authorization"])).toContain(`k=${keys.publicKey}`);
    expect(r.headers["TTL"]).toBe(6 * 60 * 60);
    expect(Buffer.from(r.body as Buffer).includes(Buffer.from("Time to train"))).toBe(false);
  });

  describe("through /api/v1", () => {
    const verifier: SessionVerifier = {
      verify: async (req) => sessions.get(req.headers.get("x-test-user") ?? "") ?? null,
    };
    const deps = (): Deps => ({ db: api, verifier });
    const req = (method: string, body?: unknown, key?: string) =>
      new Request("http://test/api/v1/x", {
        method,
        headers: {
          "x-test-user": athlete,
          "content-type": "application/json",
          ...(key ? { "idempotency-key": key } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    const feedRoute = apiRoute(
      { name: "GET /notifications", handler: ({ tx, session }) => getFeed(tx, session.userId) },
      deps,
    );
    const readRoute = apiRoute(
      {
        name: "POST /notifications/read",
        body: feedReadRequestSchema,
        idempotent: true,
        handler: ({ tx, session, body }) => markRead(tx, session.userId, body.ids),
      },
      deps,
    );
    const tokenRoute = apiRoute(
      {
        name: "POST /me/push-tokens",
        body: pushTokenRequestSchema,
        idempotent: true,
        status: 201,
        handler: ({ tx, session, body }) => savePushToken(tx, session.userId, body),
      },
      deps,
    );
    const untokenRoute = apiRoute(
      {
        name: "DELETE /me/push-tokens",
        body: pushTokenDeleteSchema,
        idempotent: true,
        handler: async ({ tx, session, body }) => {
          await deletePushToken(tx, session.userId, body.token);
          return { ok: true };
        },
      },
      deps,
    );

    it("GET /notifications lists the athlete's notices, unread first counted; a switched-off kind is left out", async () => {
      await queue(athlete, "daily_reminder", "feed-a");
      const off = await queue(athlete, "challenge_ending", "feed-off");
      await admin.query(
        "update notifications set status = 'skipped', last_error = 'toggle_off' where id = $1",
        [off],
      );
      const res = await feedRoute(req("GET"));
      expect(res.status).toBe(200);
      const feed = feedResponseSchema.parse(await res.json());
      expect(feed.items.map((i) => i.kind)).toContain("daily_reminder");
      expect(feed.items.map((i) => i.id)).not.toContain(off);
      expect(feed.unread).toBe(feed.items.length);
      expect(feed.timezone).toBe("Asia/Kolkata");

      const read = await readRoute(req("POST", { ids: [feed.items[0]!.id] }, `read1-${tag}`));
      expect(await read.json()).toEqual({ unread: feed.items.length - 1 });
      const all = await readRoute(req("POST", {}, `readall-${tag}`));
      expect(await all.json()).toEqual({ unread: 0 });
    });

    it("POST /me/push-tokens stores a web subscription once; a new key for the same endpoint replaces it; DELETE drops it", async () => {
      const endpoint = `https://fcm.googleapis.com/fcm/send/${tag}`;
      const first = fakeSubscription(endpoint);
      expect(
        (await tokenRoute(req("POST", { platform: "web", subscription: first }, `t1-${tag}`)))
          .status,
      ).toBe(201);
      expect(
        (await tokenRoute(req("POST", { platform: "web", subscription: first }, `t1b-${tag}`)))
          .status,
      ).toBe(201);
      const second = fakeSubscription(endpoint);
      await tokenRoute(req("POST", { platform: "web", subscription: second }, `t2-${tag}`));
      const rows = await admin.query<{ token: string }>(
        "select token from push_tokens where user_id = $1 and platform = 'web'",
        [athlete],
      );
      expect(rows.rows).toHaveLength(1);
      expect(JSON.parse(rows.rows[0]!.token).keys.p256dh).toBe(second.keys.p256dh);

      expect(
        (
          await tokenRoute(
            req(
              "POST",
              {
                platform: "web",
                subscription: { ...first, endpoint: "http://insecure.example/x" },
              },
              `t3-${tag}`,
            ),
          )
        ).status,
      ).toBe(400);

      expect((await untokenRoute(req("DELETE", { token: endpoint }, `d1-${tag}`))).status).toBe(
        200,
      );
      const left = await admin.query("select 1 from push_tokens where user_id = $1", [athlete]);
      expect(left.rowCount).toBe(0);
    });
  });
});
