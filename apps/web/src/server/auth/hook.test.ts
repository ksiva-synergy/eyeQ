import { randomBytes } from "node:crypto";
import { Webhook } from "standardwebhooks";
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@eyeq/db";
import { handleSendSmsHook } from "./hook";
import { SmsRefused, testSender, type SmsSender } from "./sms";

process.env["LOG_SILENT"] = "1";
const raw = randomBytes(32).toString("base64");
const secret = `v1,whsec_${raw}`;

function signed(body: unknown, key = raw, url = "http://test/api/auth/sms-hook"): Request {
  const payload = JSON.stringify(body);
  const id = `msg_${randomBytes(6).toString("hex")}`;
  const ts = new Date();
  const sig = new Webhook(key).sign(id, ts, payload);
  return new Request(url, {
    method: "POST",
    body: payload,
    headers: {
      "webhook-id": id,
      "webhook-timestamp": String(Math.floor(ts.getTime() / 1000)),
      "webhook-signature": sig,
    },
  });
}

const event = { user: { id: "u1", phone: "919876543210" }, sms: { otp: "123456" } };
const db = (allowed: boolean) =>
  ({
    $queryRaw: vi.fn(async () => [{ r: { allowed, retry_after: 60 } }]),
  }) as unknown as PrismaClient;
const sender = (): SmsSender & { sent: string[] } => {
  const sent: string[] = [];
  return { name: "fake", sent, sendOtp: async (p, otp) => void sent.push(`${p}:${otp}`) };
};

describe("Send SMS hook", () => {
  it("verifies the signature, counts the phone and sends the code", async () => {
    const s = sender();
    const res = await handleSendSmsHook(signed(event), { secret, sender: s, db: db(true) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    expect(s.sent).toEqual(["+919876543210:123456"]);
  });

  it("verifies when the URL carries Vercel's protection-bypass parameter (staging)", async () => {
    // Supabase cannot send custom headers, so the hook URL on a protected deployment ends
    // in ?x-vercel-protection-bypass=…; the signature covers the body, not the URL.
    const s = sender();
    const req = signed(
      event,
      raw,
      "http://test/api/auth/sms-hook?x-vercel-protection-bypass=bypass-secret",
    );
    const res = await handleSendSmsHook(req, { secret, sender: s, db: db(true) });
    expect(res.status).toBe(200);
    expect(s.sent).toEqual(["+919876543210:123456"]);
  });

  it("accepts any secret in a rotation list", async () => {
    const res = await handleSendSmsHook(signed(event), {
      secret: `v1,whsec_${randomBytes(32).toString("base64")}|${secret}`,
      sender: sender(),
      db: db(true),
    });
    expect(res.status).toBe(200);
  });

  it("rejects a bad signature without sending", async () => {
    const s = sender();
    const res = await handleSendSmsHook(signed(event, randomBytes(32).toString("base64")), {
      secret,
      sender: s,
      db: db(true),
    });
    expect(res.status).toBe(401);
    expect(s.sent).toEqual([]);
  });

  it("refuses over the limit in the shape Supabase Auth passes on (429)", async () => {
    const s = sender();
    const res = await handleSendSmsHook(signed(event), { secret, sender: s, db: db(false) });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(await res.json()).toMatchObject({ error: { http_code: 429 } });
    expect(s.sent).toEqual([]);
  });

  it("passes on a sender refusal (staging: only the test number)", async () => {
    const res = await handleSendSmsHook(signed(event), {
      secret,
      sender: testSender("+919000000001"),
      db: db(true),
    });
    expect(await res.json()).toMatchObject({ error: { http_code: 403 } });
  });

  it("is refused when the secret is not configured", async () => {
    const res = await handleSendSmsHook(signed(event), {
      secret: undefined,
      sender: sender(),
      db: db(true),
    });
    expect(res.status).toBe(500);
  });

  it("maps an unexpected sender failure to 502", async () => {
    const failing: SmsSender = {
      name: "x",
      sendOtp: async () => Promise.reject(new Error("down")),
    };
    const res = await handleSendSmsHook(signed(event), { secret, sender: failing, db: db(true) });
    expect(await res.json()).toMatchObject({ error: { http_code: 502 } });
    expect(new SmsRefused("x")).toBeInstanceOf(Error);
  });
});
