import { Webhook } from "standardwebhooks";
import type { PrismaClient } from "@eyeq/db";
import { log, maskPhone } from "../observability/log";
import { e164 } from "./session";
import { SmsRefused, type SmsSender } from "./sms";

/**
 * Supabase Auth's Send SMS hook (HTTP). Supabase signs each call with Standard Webhooks
 * headers; the secret is "v1,whsec_<base64>" (several may be joined with "|" during a
 * rotation). A refusal is a 200 with {"error": {"http_code", "message"}}, which Supabase
 * Auth passes back to whoever asked for the code.
 */
export interface HookDeps {
  secret: string | undefined;
  sender: SmsSender;
  db: PrismaClient; // eyeq_service
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const refuse = (httpCode: number, message: string) =>
  json({ error: { http_code: httpCode, message } });

function verify(secret: string, payload: string, headers: Headers): unknown {
  const h = {
    "webhook-id": headers.get("webhook-id") ?? "",
    "webhook-timestamp": headers.get("webhook-timestamp") ?? "",
    "webhook-signature": headers.get("webhook-signature") ?? "",
  };
  let lastError: unknown;
  for (const s of secret.split("|")) {
    try {
      return new Webhook(s.trim().replace(/^v1,whsec_/, "")).verify(payload, h);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

export async function handleSendSmsHook(req: Request, deps: HookDeps): Promise<Response> {
  if (!deps.secret) {
    log("error", "sms hook called but SEND_SMS_HOOK_SECRET is not set");
    return json({ error: { http_code: 500, message: "SMS hook not configured" } }, 500);
  }
  const payload = await req.text();
  let event: { user?: { id?: string; phone?: string }; sms?: { otp?: string } };
  try {
    event = verify(deps.secret, payload, req.headers) as typeof event;
  } catch {
    log("warn", "sms hook signature rejected");
    return json({ error: { http_code: 401, message: "invalid signature" } }, 401);
  }
  const phone = e164(event.user?.phone);
  const otp = event.sms?.otp;
  if (!phone || !otp) return refuse(400, "The request has no phone number or code.");

  // Second door for the plan's limit (5 codes per phone per hour): this one also covers
  // clients that call Supabase Auth directly rather than through /api/auth/otp.
  const rows = await deps.db.$queryRaw<{ r: { allowed: boolean } }[]>`
    select rate_limit_hit('otp_sms_phone', ${phone}) as r`;
  if (rows[0]?.r && !rows[0].r.allowed) {
    log("warn", "sms hook rate limited", { phone: maskPhone(phone), userId: event.user?.id });
    return refuse(429, "Too many codes requested for this number. Try again later.");
  }

  try {
    await deps.sender.sendOtp(phone, otp);
  } catch (e) {
    if (e instanceof SmsRefused) return refuse(403, e.message);
    log("error", "sms send failed", { sender: deps.sender.name, error: String(e) });
    return refuse(502, "The code could not be sent. Try again.");
  }
  return json({});
}
