import type { PrismaClient } from "@eyeq/db";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "../api/errors";
import { log, maskEmail, maskPhone } from "../observability/log";

/**
 * Phone or email OTP through Supabase Auth, behind our own limits (plan 5.2): 5 requests
 * per phone or email (the otp_phone rule, keyed by either) and 20 per IP per hour,
 * counted in rate_limits before Supabase is asked. Counted in autocommit calls, so
 * refused requests count too. Email codes need {{ .Token }} in Supabase's Magic Link and
 * Confirm signup templates (DECISIONS.md, 2026-10-11).
 */
export type OtpTarget = { phone: string } | { email: string };

const subjectOf = (t: OtpTarget) => ("phone" in t ? t.phone : t.email);
const masked = (t: OtpTarget) =>
  "phone" in t ? { phone: maskPhone(t.phone) } : { email: maskEmail(t.email) };

export interface OtpDeps {
  supabase: SupabaseClient;
  db: PrismaClient; // eyeq_service
}

async function hit(db: PrismaClient, rule: "otp_phone" | "otp_ip", subject: string) {
  const rows = await db.$queryRaw<{ r: { allowed: boolean; retry_after: number } }[]>`
    select rate_limit_hit(${rule}, ${subject}) as r`;
  return rows[0]!.r;
}

export async function requestOtp(
  target: OtpTarget,
  ip: string | null,
  deps: OtpDeps,
): Promise<void> {
  const byPhone = await hit(deps.db, "otp_phone", subjectOf(target));
  const byIp = ip ? await hit(deps.db, "otp_ip", ip) : { allowed: true, retry_after: 0 };
  if (!byPhone.allowed || !byIp.allowed) {
    log("warn", "otp rate limited", {
      ...masked(target),
      by: byPhone.allowed ? "ip" : "phone",
    });
    throw new ApiError(
      429,
      "rate_limited",
      "Too many codes requested. Try again later.",
      undefined,
      {
        "retry-after": String(Math.max(byPhone.retry_after, byIp.retry_after)),
      },
    );
  }
  const { error } = await deps.supabase.auth.signInWithOtp(
    "phone" in target
      ? { phone: target.phone, options: { shouldCreateUser: true, channel: "sms" } }
      : { email: target.email, options: { shouldCreateUser: true } },
  );
  if (error) {
    log("warn", "otp send refused by supabase", {
      ...masked(target),
      status: error.status,
      code: error.code,
    });
    const status = error.status === 429 ? 429 : error.status && error.status < 500 ? 400 : 502;
    throw new ApiError(
      status,
      status === 429 ? "rate_limited" : "otp_send_failed",
      "The code could not be sent.",
    );
  }
}

/** Verifies the code; @supabase/ssr writes the session cookies through the client's jar. */
export async function verifyOtp(
  target: OtpTarget,
  token: string,
  deps: OtpDeps,
): Promise<{ userId: string }> {
  const { data, error } = await deps.supabase.auth.verifyOtp(
    "phone" in target
      ? { phone: target.phone, token, type: "sms" }
      : { email: target.email, token, type: "email" },
  );
  if (error || !data.user) {
    throw new ApiError(400, "otp_invalid", "That code is not right, or it has expired.");
  }
  await ensureProfile(deps.db, data.user.id, null);
  return { userId: data.user.id };
}

/** First sign-in: the profile and user_stats rows (migration 0014). */
export async function ensureProfile(
  db: PrismaClient,
  userId: string,
  name: string | null,
): Promise<void> {
  await db.$queryRaw`select ensure_profile_for(${userId}::uuid, ${name})`;
}

export function clientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
}
